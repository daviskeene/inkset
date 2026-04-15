// Public API surface for @preframe/core.
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
  Properties,
  StreamEvent,
} from "./types";

export { PreframeError } from "./types";
export { PluginRegistry } from "./plugin";
export { Ingest, splitBlocks, repair } from "./ingest";
export { createBlocks, parseBlock, parseBlocks, extractText } from "./parse";
export { transformBlocks, retransformWidthSensitive } from "./transform";
export { MeasureLayer, LRUCache } from "./measure";
export { escapeHtml, nodeToHtml, propsToAttrs } from "./html";
export { computeLayout, getLayoutHeight, getVisibleBlocks } from "./layout";
export { StreamingPipeline } from "./stream";
export type { PipelineState, PipelineMetrics } from "./stream";
