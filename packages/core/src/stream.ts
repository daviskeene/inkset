// Streaming pipeline: orchestrates ingest -> parse -> transform -> measure -> layout.
import type {
  EnrichedNode,
  LayoutTree,
  MeasuredBlock,
  InksetOptions,
  PluginContext,
} from "./types";
import { Ingest, splitBlocks } from "./ingest";
import {
  collectDocumentReferences,
  createBlocks,
  parseBlocks,
  extractText,
  type ParseCacheEntry,
} from "./parse";
import { transformBlocks, retransformWidthSensitive } from "./transform";
import { MeasureLayer } from "./measure";
import { computeLayout, getLayoutHeight } from "./layout";
import { DEFAULT_BLOCK_SPACING } from "./block-spacing";
import { PluginRegistry } from "./plugin";
import {
  hyphenateBlock,
  loadHyphenator,
  type Hyphenator,
  type SupportedLanguage,
} from "./hyphenate";
import type { GlyphPositionLookup } from "./glyph-positions";

const DEFAULT_FONT = "system-ui, sans-serif";
const DEFAULT_FONT_SIZE = 16;
const DEFAULT_LINE_HEIGHT = 24;
const DEFAULT_CACHE_SIZE = 500;

// ── Pipeline state ─────────────────────────────────────────────────

export type PipelineState = {
  layout: LayoutTree;
  totalHeight: number;
  isStreaming: boolean;
  blockCount: number;
  metrics: PipelineMetrics;
  /**
   * Monotonic tick counter, incremented once per `runPipeline()`. The reveal
   * layer threads this onto newly-wrapped tokens so React can distinguish
   * "spans from this frame" from "spans carried over from the previous frame"
   * without diffing the AST.
   */
  tick: number;
};

export type PipelineMetrics = {
  lastParseMs: number;
  lastTransformMs: number;
  lastMeasureMs: number;
  lastLayoutMs: number;
  totalPipelineMs: number;
  /**
   * Fraction of blocks in the last pipeline run whose measurements were
   * reused from the block-level measure cache (0..1).
   */
  cacheHitRate: number;
};

// ── Streaming orchestrator ─────────────────────────────────────────

export class StreamingPipeline {
  private ingest = new Ingest();
  private registry = new PluginRegistry();
  private measureLayer: MeasureLayer;

  private parseCache = new Map<number, ParseCacheEntry>();
  private transformCache = new Map<number, EnrichedNode>();
  private hyphenCache = new Map<number, { source: EnrichedNode; hyphenated: EnrichedNode }>();
  // Keyed by blockId; entries are only valid for the same node identity at the
  // same container width, so both are stored alongside the measurement.
  private measureCache = new Map<number, { width: number; block: MeasuredBlock }>();

  private currentNodes: EnrichedNode[] = [];
  private currentMeasured: MeasuredBlock[] = [];
  private currentLayout: LayoutTree = [];
  private containerWidth = 0;
  private pendingRelayoutWidth: number | null = null;
  private relayoutInFlight = false;
  private options: Required<
    Omit<
      InksetOptions,
      | "plugins"
      | "hyphenation"
      | "textWrap"
      | "headingSizes"
      | "headingWeights"
      | "headingLineHeights"
      | "shrinkwrap"
    >
  > & {
    hyphenation: InksetOptions["hyphenation"];
    textWrap: InksetOptions["textWrap"];
    headingSizes: InksetOptions["headingSizes"];
    headingWeights: InksetOptions["headingWeights"];
    headingLineHeights: InksetOptions["headingLineHeights"];
    shrinkwrap: InksetOptions["shrinkwrap"];
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
  private tick = 0;
  private lastMeasureCacheHits = 0;

  private listeners: Set<(state: PipelineState) => void> = new Set();

  constructor(options?: InksetOptions) {
    this.options = {
      font: options?.font ?? DEFAULT_FONT,
      fontSize: options?.fontSize ?? DEFAULT_FONT_SIZE,
      lineHeight: options?.lineHeight ?? DEFAULT_LINE_HEIGHT,
      blockSpacing: options?.blockSpacing ?? DEFAULT_BLOCK_SPACING,
      cacheSize: options?.cacheSize ?? DEFAULT_CACHE_SIZE,
      hyphenation: options?.hyphenation,
      textWrap: options?.textWrap,
      headingSizes: options?.headingSizes,
      headingWeights: options?.headingWeights,
      headingLineHeights: options?.headingLineHeights,
      shrinkwrap: options?.shrinkwrap ?? false,
    };

    this.measureLayer = new MeasureLayer({
      font: this.options.font,
      fontSize: this.options.fontSize,
      lineHeight: this.options.lineHeight,
      cacheSize: this.options.cacheSize,
      headingSizes: this.options.headingSizes,
      headingWeights: this.options.headingWeights,
      headingLineHeights: this.options.headingLineHeights,
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

    // Fire plugin preloads in the background. Blocking the first render on
    // shiki (~1–2 MB) + katex + mermaid (~650 KB) added hundreds of ms to
    // initial paint. Plugin components already degrade to raw source while
    // their dep loads and upgrade in place once it resolves, so the trade
    // is a brief pop-in on code/math/diagram blocks in exchange for snappy
    // paragraph/heading/list rendering. Consumers who need no-flicker can
    // call `warmPlugins()` explicitly before rendering.
    void this.warmPlugins();

    // Only pretext + fonts + hyphenator block first render. These are small
    // and typically already cached by the time init() runs (see the eager
    // pretext import in measure.ts).
    await Promise.all([this.measureLayer.init(), hyphenationPromise]);
    this.initialized = true;
  }

  /**
   * Await every registered plugin's `preload()`. Useful when a consumer
   * wants a fully-upgraded first paint (no raw → highlighted pop-in for
   * code/math/diagram) at the cost of a slower initial render. Background-
   * fired during `init()` already, so calling this afterwards reuses the
   * in-flight promises.
   */
  async warmPlugins(): Promise<void> {
    await Promise.all(
      this.registry.all().map((plugin) =>
        plugin.preload
          ? plugin.preload().catch((err: unknown) => {
              console.warn(`[inkset] plugin "${plugin.name}" preload failed:`, err);
            })
          : Promise.resolve(),
      ),
    );
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
    // Already-closed ingest means the document was fully settled by a prior
    // setContent()/endStream(); re-running the pipeline would be a no-op.
    if (!this.ingest.isStreaming) return;
    this.ingest.end();
    this.cancelPendingUpdate();
    await this.runPipeline();
  }

  /**
   * Replace the whole document. With `streaming: true` the ingest stays open
   * so subsequent `appendToken()` calls extend this content incrementally;
   * call `endStream()` to settle. Default closes the stream (settled content).
   */
  async setContent(content: string, options?: { streaming?: boolean }): Promise<void> {
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
    if (!options?.streaming) {
      this.ingest.end();
    }
    await this.runPipeline();
  }

  subscribe(listener: (state: PipelineState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): PipelineState {
    return {
      layout: this.currentLayout,
      totalHeight: getLayoutHeight(this.currentLayout),
      isStreaming: this.ingest.isStreaming,
      blockCount: this.currentNodes.length,
      metrics: { ...this.metrics },
      tick: this.tick,
    };
  }

  getRegistry(): PluginRegistry {
    return this.registry;
  }

  /**
   * Expose a glyph-position lookup for a given block at a given container
   * width. Used by the reveal layer (`@inkset/animate` + `@inkset/react`) to
   * sort new tokens in layout order and to pass pixel coords to consumer
   * `RevealComponent` props. Returns null when pretext is unavailable.
   */
  buildGlyphLookupForBlock(node: EnrichedNode, maxWidth: number): GlyphPositionLookup | null {
    return this.measureLayer.buildGlyphLookupForBlock(node, maxWidth);
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

    this.tick += 1;
    const pipelineStart = performance.now();

    const repaired = this.ingest.getRepaired();
    const { blocks: rawBlocks, references } = collectDocumentReferences(splitBlocks(repaired));
    const blocks = createBlocks(rawBlocks, references);

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
    const transformed = transformBlocks(
      nodes,
      this.registry,
      ctx,
      this.transformCache,
      parsedBlockIds,
    );
    this.currentNodes = this.applyHyphenation(transformed);
    this.metrics.lastTransformMs = performance.now() - transformStart;

    const measureStart = performance.now();
    this.lastMeasureCacheHits = 0;
    this.currentMeasured = await this.measureBlocks(this.currentNodes, this.containerWidth);
    this.metrics.lastMeasureMs = performance.now() - measureStart;

    const layoutStart = performance.now();
    this.currentLayout = computeLayout(this.currentMeasured, {
      containerWidth: this.containerWidth,
      blockSpacing: this.options.blockSpacing,
    });
    this.metrics.lastLayoutMs = performance.now() - layoutStart;

    this.metrics.totalPipelineMs = performance.now() - pipelineStart;
    this.metrics.cacheHitRate =
      this.currentNodes.length > 0 ? this.lastMeasureCacheHits / this.currentNodes.length : 0;

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
        const dims = await this.measureLayer.relayout(measured, targetWidth, plugin);
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
      blockSpacing: this.options.blockSpacing,
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
      // Node identity is the validity key: frozen blocks keep the same
      // enriched-node object across ticks, while the hot block (and any
      // frozen block re-parsed after a repair rewrite) gets a fresh one.
      const cached = this.measureCache.get(node.blockId);
      if (cached && cached.block.node === node && cached.width === containerWidth) {
        this.lastMeasureCacheHits++;
        measured.push(cached.block);
        continue;
      }

      const plugin = node.transformedBy ? this.registry.get(node.transformedBy) : undefined;

      const result = await this.measureLayer.measureBlock(node, containerWidth, plugin);

      // Shrinkwrap only applies to text-shaped blocks; plugin-rendered blocks
      // (code, table, math) own their own width and shouldn't be narrowed.
      if (
        this.options.shrinkwrap &&
        shouldShrinkwrap(node.blockType, this.options.shrinkwrap) &&
        !plugin?.measure
      ) {
        const shrink = await this.measureLayer.measureShrinkwrapWidth(
          extractText(node),
          containerWidth,
          node.blockType === "heading" ? getHeadingLevelFromNode(node) : undefined,
        );
        if (shrink && shrink.width > 0 && shrink.width < containerWidth) {
          result.shrinkwrapWidth = shrink.width;
        }
      }

      this.measureCache.set(node.blockId, { width: containerWidth, block: result });
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

// ── Shrinkwrap helpers ────────────────────────────────────────────

const shouldShrinkwrap = (
  blockType: string,
  option: NonNullable<InksetOptions["shrinkwrap"]>,
): boolean => {
  if (option === false) return false;
  if (option === "headings") return blockType === "heading";
  if (option === "paragraphs") {
    return blockType === "paragraph" || blockType === "blockquote";
  }
  // option === true: everything text-shaped
  return (
    blockType === "paragraph" ||
    blockType === "heading" ||
    blockType === "blockquote" ||
    blockType === "list"
  );
};

const getHeadingLevelFromNode = (node: EnrichedNode): number | undefined => {
  const tag = node.tagName ?? node.children?.[0]?.tagName ?? "";
  const match = /^h([1-6])$/.exec(tag);
  return match ? parseInt(match[1], 10) : undefined;
};
