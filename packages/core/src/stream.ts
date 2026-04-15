import type {
  EnrichedNode,
  LayoutTree,
  MeasuredBlock,
  PreframeOptions,
  ASTNode,
  PluginContext,
  StreamEvent,
} from "./types.js";
import { Ingest, splitBlocks } from "./ingest.js";
import { createBlocks, parseBlocks, extractText } from "./parse.js";
import { transformBlocks, retransformWidthSensitive } from "./transform.js";
import { MeasureLayer } from "./measure.js";
import { computeLayout, getLayoutHeight } from "./layout.js";
import { PluginRegistry } from "./plugin.js";

// ── Pipeline state ─────────────────────────────────────────────────

export interface PipelineState {
  layout: LayoutTree;
  totalHeight: number;
  isStreaming: boolean;
  blockCount: number;
  /** Performance metrics for DevTools */
  metrics: PipelineMetrics;
}

export interface PipelineMetrics {
  lastParseMs: number;
  lastTransformMs: number;
  lastMeasureMs: number;
  lastLayoutMs: number;
  totalPipelineMs: number;
  cacheHitRate: number;
}

// ── Streaming orchestrator ─────────────────────────────────────────

/**
 * StreamingPipeline coordinates the full render pipeline:
 * ingest -> parse -> transform -> measure -> layout
 *
 * It manages block-level memoization, debounced measurement,
 * and incremental updates during streaming.
 */
export class StreamingPipeline {
  private ingest = new Ingest();
  private registry = new PluginRegistry();
  private measureLayer: MeasureLayer;

  // Caches for each layer
  private parseCache = new Map<number, ASTNode>();
  private transformCache = new Map<number, EnrichedNode>();
  private measureCache = new Map<number, MeasuredBlock>();

  // Current state
  private currentNodes: EnrichedNode[] = [];
  private currentMeasured: MeasuredBlock[] = [];
  private currentLayout: LayoutTree = [];
  private containerWidth = 0;
  private options: Required<Omit<PreframeOptions, "plugins">>;

  // Debounce state
  private pendingUpdate: number | null = null;
  private initialized = false;

  // Metrics
  private metrics: PipelineMetrics = {
    lastParseMs: 0,
    lastTransformMs: 0,
    lastMeasureMs: 0,
    lastLayoutMs: 0,
    totalPipelineMs: 0,
    cacheHitRate: 0,
  };

  // Listeners
  private listeners: Set<(state: PipelineState) => void> = new Set();

  constructor(options?: PreframeOptions) {
    this.options = {
      font: options?.font ?? "system-ui, sans-serif",
      fontSize: options?.fontSize ?? 16,
      lineHeight: options?.lineHeight ?? 24,
      blockMargin: options?.blockMargin ?? 16,
      cacheSize: options?.cacheSize ?? 500,
    };

    this.measureLayer = new MeasureLayer({
      font: this.options.font,
      fontSize: this.options.fontSize,
      lineHeight: this.options.lineHeight,
      cacheSize: this.options.cacheSize,
    });

    // Register plugins
    if (options?.plugins) {
      for (const plugin of options.plugins) {
        this.registry.register(plugin);
      }
    }
  }

  /** Initialize async resources (fonts, pretext) */
  async init(): Promise<void> {
    if (this.initialized) return;
    await this.measureLayer.init();
    this.initialized = true;
  }

  /** Set the container width. Triggers re-layout. */
  async setWidth(width: number): Promise<void> {
    if (width === this.containerWidth) return;
    this.containerWidth = width;

    if (this.currentNodes.length > 0) {
      await this.relayout();
    }
  }

  /** Append a streaming token. Triggers incremental pipeline update. */
  async appendToken(token: string): Promise<void> {
    const events = this.ingest.append(token);
    if (events.length === 0) return;

    // Debounce: schedule pipeline update on next animation frame
    this.schedulePipelineUpdate();
  }

  /** End the stream. Runs final pipeline update. */
  async endStream(): Promise<void> {
    this.ingest.end();
    this.cancelPendingUpdate();
    await this.runPipeline();
  }

  /** Set complete content (non-streaming mode) */
  async setContent(content: string): Promise<void> {
    this.ingest.reset();
    // Append all content at once
    this.ingest.append(content);
    this.ingest.end();
    await this.runPipeline();
  }

  /** Subscribe to state changes */
  subscribe(listener: (state: PipelineState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Get current state */
  getState(): PipelineState {
    return {
      layout: this.currentLayout,
      totalHeight: getLayoutHeight(this.currentLayout, this.options.blockMargin),
      isStreaming: this.ingest.isStreaming,
      blockCount: this.currentNodes.length,
      metrics: { ...this.metrics },
    };
  }

  /** Get the plugin registry (for React adapter to look up components) */
  getRegistry(): PluginRegistry {
    return this.registry;
  }

  /** Clean up resources */
  destroy(): void {
    this.cancelPendingUpdate();
    this.listeners.clear();
    this.parseCache.clear();
    this.transformCache.clear();
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
      // Node.js / test environment
      this.pendingUpdate = setTimeout(() => {
        this.pendingUpdate = null;
        this.runPipeline();
      }, 0) as unknown as number;
    }
  }

  private cancelPendingUpdate(): void {
    if (this.pendingUpdate !== null) {
      if (typeof cancelAnimationFrame !== "undefined") {
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

    // 1. Get repaired document and split into blocks
    const repaired = this.ingest.getRepaired();
    const rawBlocks = splitBlocks(repaired);
    const blocks = createBlocks(rawBlocks);

    // Mark all blocks except the last as frozen (not hot) when streaming
    if (this.ingest.isStreaming) {
      for (let i = 0; i < blocks.length - 1; i++) {
        blocks[i].hot = false;
      }
    } else {
      // Stream ended — all blocks frozen
      for (const block of blocks) {
        block.hot = false;
      }
    }

    // 2. Parse (incremental — only hot blocks re-parse)
    const parseStart = performance.now();
    const nodes = parseBlocks(blocks, this.parseCache);
    this.metrics.lastParseMs = performance.now() - parseStart;

    // 3. Transform through plugins
    const transformStart = performance.now();
    const ctx: PluginContext = {
      containerWidth: this.containerWidth,
      isStreaming: this.ingest.isStreaming,
    };
    this.currentNodes = transformBlocks(nodes, this.registry, ctx, this.transformCache);
    this.metrics.lastTransformMs = performance.now() - transformStart;

    // 4. Measure each block
    const measureStart = performance.now();
    this.currentMeasured = await this.measureBlocks(this.currentNodes);
    this.metrics.lastMeasureMs = performance.now() - measureStart;

    // 5. Layout
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

  /** Re-layout without re-parsing or re-measuring (pure arithmetic) */
  private async relayout(): Promise<void> {
    if (this.currentNodes.length === 0) return;

    const ctx: PluginContext = {
      containerWidth: this.containerWidth,
      isStreaming: this.ingest.isStreaming,
    };

    // Check for width-sensitive plugins that need re-transform
    const { nodes, changed } = retransformWidthSensitive(
      this.currentNodes,
      this.registry,
      ctx,
      this.transformCache,
    );

    if (changed) {
      this.currentNodes = nodes;
      // Re-measure blocks that were re-transformed
      this.currentMeasured = await this.measureBlocks(this.currentNodes);
    } else {
      // Just re-layout with new dimensions (pretext arithmetic only)
      const reMeasured: MeasuredBlock[] = [];
      for (const measured of this.currentMeasured) {
        const dims = await this.measureLayer.relayout(measured, this.containerWidth);
        reMeasured.push({ ...measured, dimensions: dims });
      }
      this.currentMeasured = reMeasured;
    }

    const layoutStart = performance.now();
    this.currentLayout = computeLayout(this.currentMeasured, {
      containerWidth: this.containerWidth,
      blockMargin: this.options.blockMargin,
    });
    this.metrics.lastLayoutMs = performance.now() - layoutStart;

    this.notify();
  }

  private async measureBlocks(nodes: EnrichedNode[]): Promise<MeasuredBlock[]> {
    const measured: MeasuredBlock[] = [];

    for (const node of nodes) {
      // Check if we have a cached measurement for frozen blocks
      const cached = this.measureCache.get(node.blockId);
      if (cached && !this.ingest.isStreaming) {
        measured.push(cached);
        continue;
      }

      // Find the plugin that transformed this node
      const plugin = node.transformedBy
        ? this.registry.get(node.transformedBy)
        : undefined;

      const result = await this.measureLayer.measureBlock(
        node,
        this.containerWidth,
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
