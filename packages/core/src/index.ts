// Public API surface for @inkset/core.
export type {
  ASTNode,
  BlockSpacing,
  BlockSpacingPairRule,
  BlockSpacingValue,
  Block,
  BlockType,
  BuiltinBlockKind,
  Dimensions,
  EnrichedNode,
  HeadingLineHeightTuple,
  HeadingSizeTuple,
  HeadingWeightTuple,
  HyphenationOption,
  LayoutBlock,
  LayoutTree,
  MeasuredBlock,
  PluginComponentProps,
  PluginContext,
  InksetOptions,
  InksetPlugin,
  Properties,
  ShrinkwrapOption,
  StreamEvent,
  TextWrapOption,
} from "./types";

export { InksetError } from "./types";
export { DEFAULT_BLOCK_SPACING, getNodeBlockKind, resolveBlockGap } from "./block-spacing";
export { PluginRegistry } from "./plugin";
export { Ingest, splitBlocks, repair } from "./ingest";
export { createBlocks, parseBlock, parseBlocks, extractText } from "./parse";
export { transformBlocks, retransformWidthSensitive } from "./transform";
export {
  MeasureLayer,
  LRUCache,
  DEFAULT_HEADING_SIZES,
  DEFAULT_HEADING_WEIGHTS,
  DEFAULT_HEADING_LINE_HEIGHTS,
  getPretextSync,
} from "./measure";
export { buildGlyphLookup } from "./glyph-positions";
export type {
  TokenCoord,
  GlyphPositionLookup,
  BuildGlyphLookupOptions,
  GlyphPretextModule,
} from "./glyph-positions";
export { escapeHtml, nodeToHtml, propsToAttrs } from "./html";
export { computeLayout, getLayoutHeight, getVisibleBlocks } from "./layout";
export { StreamingPipeline } from "./stream";
export type { PipelineState, PipelineMetrics } from "./stream";
export { hyphenateBlock, loadHyphenator } from "./hyphenate";
export type { Hyphenator, SupportedLanguage } from "./hyphenate";
