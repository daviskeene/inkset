// Public API surface for @inkset/core.
export type {
  ASTNode,
  Block,
  BlockType,
  Dimensions,
  EnrichedNode,
  HyphenationOption,
  LayoutBlock,
  LayoutTree,
  MeasuredBlock,
  PluginComponentProps,
  PluginContext,
  InksetOptions,
  InksetPlugin,
  Properties,
  StreamEvent,
  TextWrapOption,
} from "./types";

export { InksetError } from "./types";
export { PluginRegistry } from "./plugin";
export { Ingest, splitBlocks, repair } from "./ingest";
export { createBlocks, parseBlock, parseBlocks, extractText } from "./parse";
export { transformBlocks, retransformWidthSensitive } from "./transform";
export { MeasureLayer, LRUCache } from "./measure";
export { escapeHtml, nodeToHtml, propsToAttrs } from "./html";
export { computeLayout, getLayoutHeight, getVisibleBlocks } from "./layout";
export { StreamingPipeline } from "./stream";
export type { PipelineState, PipelineMetrics } from "./stream";
export { hyphenateBlock, loadHyphenator } from "./hyphenate";
export type { Hyphenator, SupportedLanguage } from "./hyphenate";
