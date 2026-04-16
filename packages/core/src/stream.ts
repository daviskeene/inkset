// Streaming pipeline: orchestrates ingest -> parse -> transform -> measure -> layout.
import type {
  EnrichedNode,
  LayoutTree,
  MeasuredBlock,
  InksetOptions,
  ASTNode,
  PluginContext,
} from "./types";
import { Ingest, splitBlocks } from "./ingest";
import { createBlocks, parseBlocks, extractText } from "./parse";
import { transformBlocks, retransformWidthSensitive } from "./transform";
import { MeasureLayer } from "./measure";
import { computeLayout, getLayoutHeight } from "./layout";
import { PluginRegistry } from "./plugin";
import { hyphenateBlock, loadHyphenator, type Hyphenator, type SupportedLanguage } from "./hyphenate";

const DEFAULT_FONT = "system-ui, sans-serif";
const DEFAULT_FONT_SIZE = 16;
const DEFAULT_LINE_HEIGHT = 24;
const DEFAULT_BLOCK_MARGIN = 16;
const DEFAULT_CACHE_SIZE = 500;

// ── Pipeline state ─────────────────────────────────────────────────

export type PipelineState = {
  layout: LayoutTree;
  totalHeight: number;
  isStreaming: boolean;
  blockCount: number;
  metrics: PipelineMetrics;
};

export type PipelineMetrics = {
  lastParseMs: number;
  lastTransformMs: number;
  lastMeasureMs: number;
  lastLayoutMs: number;
  totalPipelineMs: number;
  cacheHitRate: number;
};

// ── Streaming orchestrator ─────────────────────────────────────────

export class StreamingPipeline {
  private ingest = new Ingest();
  private registry = new PluginRegistry();
  private measureLayer: MeasureLayer;

  private parseCache = new Map<number, ASTNode>();
  private transformCache = new Map<number, EnrichedNode>();
  private hyphenCache = new Map<number, { source: EnrichedNode; hyphenated: EnrichedNode }>();
  private measureCache = new Map<number, MeasuredBlock>();

  private currentNodes: EnrichedNode[] = [];
  private currentMeasured: MeasuredBlock[] = [];
  private currentLayout: LayoutTree = [];
  private containerWidth = 0;
  private pendingRelayoutWidth: number | null = null;
  private relayoutInFlight = false;
  private options: Required<Omit<InksetOptions, "plugins" | "hyphenation" | "textWrap">> & {
    hyphenation: InksetOptions["hyphenation"];
    textWrap: InksetOptions["textWrap"];
  };
  private hyphenator: Hyphenator | null = null;

  private pendingUpdate: ReturnType<typeof setTimeout> | number | null = null;
  private initialized = false;

  private metrics: PipelineMetrics = {
    lastParseMs: 0,
    lastTransformMs: 0,
    lastMeasureMs: 0,
    lastLayoutMs: 0,
    totalPipelineMs: 0,
    cacheHitRate: 0,
  };

  private listeners: Set<(state: PipelineState) => void> = new Set();

  constructor(options?: InksetOptions) {
    this.options = {
      font: options?.font ?? DEFAULT_FONT,
      fontSize: options?.fontSize ?? DEFAULT_FONT_SIZE,
      lineHeight: options?.lineHeight ?? DEFAULT_LINE_HEIGHT,
      blockMargin: options?.blockMargin ?? DEFAULT_BLOCK_MARGIN,
      cacheSize: options?.cacheSize ?? DEFAULT_CACHE_SIZE,
      hyphenation: options?.hyphenation,
      textWrap: options?.textWrap,
    };

    this.measureLayer = new MeasureLayer({
      font: this.options.font,
      fontSize: this.options.fontSize,
      lineHeight: this.options.lineHeight,
      cacheSize: this.options.cacheSize,
    });

    if (options?.plugins) {
      for (const plugin of options.plugins) {
        this.registry.register(plugin);
      }
    }
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    const hyphenationPromise = this.options.hyphenation
      ? this.loadHyphenator().catch((err: unknown) => {
          console.warn("[inkset] hyphenator failed to load; rendering without soft hyphens:", err);
          this.hyphenator = null;
        })
      : Promise.resolve();

    await Promise.all([this.measureLayer.init(), hyphenationPromise]);
    this.initialized = true;
  }

  private async loadHyphenator(): Promise<void> {
    const lang: SupportedLanguage =
      typeof this.options.hyphenation === "object" && this.options.hyphenation !== null
        ? this.options.hyphenation.lang
        : "en-us";
    this.hyphenator = await loadHyphenator(lang);
  }

  async setWidth(width: number): Promise<void> {
    if (width === this.containerWidth && this.pendingRelayoutWidth === null) return;
    this.containerWidth = width;

    if (this.currentNodes.length === 0) {
      return;
    }

    this.pendingRelayoutWidth = width;
    if (this.relayoutInFlight) return;

    this.relayoutInFlight = true;
    try {
      while (this.pendingRelayoutWidth !== null) {
        const nextWidth = this.pendingRelayoutWidth;
        this.pendingRelayoutWidth = null;
        await this.relayout(nextWidth);
      }
    } finally {
      this.relayoutInFlight = false;
      if (this.pendingRelayoutWidth !== null) {
        await this.setWidth(this.pendingRelayoutWidth);
      }
    }
  }

  async appendToken(token: string): Promise<void> {
    const events = this.ingest.append(token);
    if (events.length === 0) return;
    this.schedulePipelineUpdate();
  }

  async endStream(): Promise<void> {
    this.ingest.end();
    this.cancelPendingUpdate();
    await this.runPipeline();
  }

  async setContent(content: string): Promise<void> {
    this.cancelPendingUpdate();
    this.parseCache.clear();
    this.transformCache.clear();
    this.hyphenCache.clear();
    this.measureCache.clear();
    this.currentNodes = [];
    this.currentMeasured = [];
    this.currentLayout = [];
    this.ingest.reset();
    this.ingest.append(content);
    this.ingest.end();
    await this.runPipeline();
  }

  subscribe(listener: (state: PipelineState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): PipelineState {
    return {
      layout: this.currentLayout,
      totalHeight: getLayoutHeight(this.currentLayout, this.options.blockMargin),
      isStreaming: this.ingest.isStreaming,
      blockCount: this.currentNodes.length,
      metrics: { ...this.metrics },
    };
  }

  getRegistry(): PluginRegistry {
    return this.registry;
  }

  destroy(): void {
    this.cancelPendingUpdate();
    this.listeners.clear();
    this.parseCache.clear();
    this.transformCache.clear();
    this.hyphenCache.clear();
    this.measureCache.clear();
    this.measureLayer.clearCache();
    this.ingest.reset();
  }

  // ── Private ────────────────────────────────────────────────────

  private schedulePipelineUpdate(): void {
    if (this.pendingUpdate !== null) return;

    if (typeof requestAnimationFrame !== "undefined") {
      this.pendingUpdate = requestAnimationFrame(() => {
        this.pendingUpdate = null;
        this.runPipeline();
      });
    } else {
      this.pendingUpdate = setTimeout(() => {
        this.pendingUpdate = null;
        this.runPipeline();
      }, 0);
    }
  }

  /**
   * Cache keyed on the transform output's object identity: if transform returned
   * the same reference as last time, hyphenation has nothing to redo.
   */
  private applyHyphenation(nodes: EnrichedNode[]): EnrichedNode[] {
    if (!this.hyphenator) return nodes;
    const hyphenator = this.hyphenator;

    const result: EnrichedNode[] = new Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const cached = this.hyphenCache.get(node.blockId);
      if (cached && cached.source === node) {
        result[i] = cached.hyphenated;
        continue;
      }
      const hyphenated = hyphenateBlock(node, hyphenator);
      this.hyphenCache.set(node.blockId, { source: node, hyphenated });
      result[i] = hyphenated;
    }
    return result;
  }

  private cancelPendingUpdate(): void {
    if (this.pendingUpdate !== null) {
      if (typeof cancelAnimationFrame !== "undefined" && typeof this.pendingUpdate === "number") {
        cancelAnimationFrame(this.pendingUpdate);
      } else {
        clearTimeout(this.pendingUpdate);
      }
      this.pendingUpdate = null;
    }
  }

  private async runPipeline(): Promise<void> {
    if (!this.initialized) await this.init();

    const pipelineStart = performance.now();

    const repaired = this.ingest.getRepaired();
    const rawBlocks = splitBlocks(repaired);
    const blocks = createBlocks(rawBlocks);

    if (this.ingest.isStreaming) {
      for (let i = 0; i < blocks.length - 1; i++) {
        blocks[i].hot = false;
      }
    } else {
      for (const block of blocks) {
        block.hot = false;
      }
    }

    const parseStart = performance.now();
    const { nodes, parsedBlockIds } = parseBlocks(blocks, this.parseCache);
    this.metrics.lastParseMs = performance.now() - parseStart;

    const transformStart = performance.now();
    const ctx: PluginContext = {
      containerWidth: this.containerWidth,
      isStreaming: this.ingest.isStreaming,
    };
    const transformed = transformBlocks(nodes, this.registry, ctx, this.transformCache, parsedBlockIds);
    this.currentNodes = this.applyHyphenation(transformed);
    this.metrics.lastTransformMs = performance.now() - transformStart;

    const measureStart = performance.now();
    this.currentMeasured = await this.measureBlocks(this.currentNodes, this.containerWidth);
    this.metrics.lastMeasureMs = performance.now() - measureStart;

    const layoutStart = performance.now();
    this.currentLayout = computeLayout(this.currentMeasured, {
      containerWidth: this.containerWidth,
      blockMargin: this.options.blockMargin,
    });
    this.metrics.lastLayoutMs = performance.now() - layoutStart;

    this.metrics.totalPipelineMs = performance.now() - pipelineStart;
    this.metrics.cacheHitRate =
      this.measureLayer.cacheStats.size /
      Math.max(1, this.measureLayer.cacheStats.maxSize);

    this.notify();
  }

  private async relayout(targetWidth: number): Promise<void> {
    if (this.currentNodes.length === 0) return;

    const ctx: PluginContext = {
      containerWidth: targetWidth,
      isStreaming: this.ingest.isStreaming,
    };

    const { nodes, changed } = retransformWidthSensitive(
      this.currentNodes,
      this.registry,
      ctx,
      this.transformCache,
    );

    let nextNodes = this.currentNodes;
    let nextMeasured = this.currentMeasured;

    if (changed) {
      nextNodes = this.applyHyphenation(nodes);
      nextMeasured = await this.measureBlocks(nextNodes, targetWidth);
    } else {
      const reMeasured: MeasuredBlock[] = [];
      for (const measured of this.currentMeasured) {
        const plugin = measured.node.transformedBy
          ? this.registry.get(measured.node.transformedBy)
          : undefined;
        const dims = await this.measureLayer.relayout(
          measured,
          targetWidth,
          plugin,
        );
        reMeasured.push({ ...measured, dimensions: dims });
      }
      nextMeasured = reMeasured;
    }

    if (targetWidth !== this.containerWidth) {
      return;
    }

    const layoutStart = performance.now();
    this.currentNodes = nextNodes;
    this.currentMeasured = nextMeasured;
    this.currentLayout = computeLayout(nextMeasured, {
      containerWidth: targetWidth,
      blockMargin: this.options.blockMargin,
    });
    this.metrics.lastLayoutMs = performance.now() - layoutStart;

    this.notify();
  }

  private async measureBlocks(
    nodes: EnrichedNode[],
    containerWidth: number = this.containerWidth,
  ): Promise<MeasuredBlock[]> {
    const measured: MeasuredBlock[] = [];

    for (const node of nodes) {
      const cached = this.measureCache.get(node.blockId);
      if (cached && !this.ingest.isStreaming) {
        measured.push(cached);
        continue;
      }

      const plugin = node.transformedBy
        ? this.registry.get(node.transformedBy)
        : undefined;

      const result = await this.measureLayer.measureBlock(
        node,
        containerWidth,
        plugin,
      );
      this.measureCache.set(node.blockId, result);
      measured.push(result);
    }

    return measured;
  }

  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
