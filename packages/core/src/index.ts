// Types
export type {
  ASTNode,
  Block,
  BlockType,
  Dimensions,
  EnrichedNode,
  LayoutBlock,
  LayoutTree,
  MeasuredBlock,
  PluginComponentProps,
  PluginContext,
  PreframeOptions,
  PreframePlugin,
  StreamEvent,
} from "./types.js";

export { PreframeError } from "./types.js";

// Plugin system
export { PluginRegistry } from "./plugin.js";

// Ingest layer
export { Ingest, splitBlocks, repair } from "./ingest.js";

// Parse layer
export { createBlocks, parseBlock, parseBlocks, extractText } from "./parse.js";

// Transform layer
export { transformBlocks, retransformWidthSensitive } from "./transform.js";

// Measure layer
export { MeasureLayer, LRUCache } from "./measure.js";

// Layout layer
export { computeLayout, getLayoutHeight, getVisibleBlocks } from "./layout.js";

// Streaming orchestrator
export { StreamingPipeline } from "./stream.js";
export type { PipelineState, PipelineMetrics } from "./stream.js";
