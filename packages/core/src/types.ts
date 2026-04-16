// Core type definitions for the inkset rendering pipeline.
import type { ComponentType } from "react";

// ── Block-level types ──────────────────────────────────────────────

export type BlockType =
  | "paragraph"
  | "heading"
  | "code"
  | "math-display"
  | "table"
  | "list"
  | "blockquote"
  | "html"
  | "thematic-break"
  | "custom";

export type Properties = Record<string, unknown>;

export type Block = {
  id: number;
  raw: string;
  type: BlockType;
  /** Whether this block is still receiving streaming tokens */
  hot: boolean;
};

// ── AST types (post-parse) ─────────────────────────────────────────

export interface ASTNode {
  type: string;
  tagName?: string;
  properties?: Properties;
  children?: ASTNode[];
  value?: string;
  blockId: number;
  blockType: BlockType;
  lang?: string;
  meta?: string;
}

// ── Enriched AST (post-transform) ──────────────────────────────────

export interface EnrichedNode extends ASTNode {
  pluginData?: Record<string, unknown>;
  transformedBy?: string;
}

// ── Measurement types ──────────────────────────────────────────────

export type Dimensions = {
  width: number;
  height: number;
};

export type MeasuredBlock = {
  blockId: number;
  node: EnrichedNode;
  dimensions: Dimensions;
  preparedHandle?: unknown;
  /** Narrowest width that preserves greedy line count. Set when shrinkwrap is enabled. */
  shrinkwrapWidth?: number;
};

// ── Layout types ───────────────────────────────────────────────────

export type LayoutBlock = {
  blockId: number;
  x: number;
  y: number;
  width: number;
  height: number;
  node: EnrichedNode;
  /** Carried through from MeasuredBlock so renderers can apply `max-width`. */
  shrinkwrapWidth?: number;
};

export type LayoutTree = LayoutBlock[];

// ── Plugin types ───────────────────────────────────────────────────

export type PluginContext = {
  containerWidth: number;
  isStreaming: boolean;
};

export interface InksetPlugin {
  name: string;
  /**
   * Optional identity key that differentiates instances of the same
   * plugin when their options differ. Participates in the plugin signature
   * used by `useInkset` — changing this rebuilds the pipeline, invalidating
   * caches so transform() runs again with the new options. Typically
   * derived by hashing the options object.
   */
  key?: string;
  /** AST node types this plugin handles (e.g., "code", "math-display") */
  handles: string[];
  /** If true, transform() re-runs when container width changes */
  widthSensitive?: boolean;
  /**
   * Optional async initialiser for heavy dependencies (e.g. shiki, katex).
   * Awaited during pipeline init so the first render doesn't flicker between
   * raw fallback and styled output. Plugins should make this idempotent.
   */
  preload?(): Promise<void>;
  transform(node: ASTNode, ctx: PluginContext): EnrichedNode;
  /** If omitted, pretext measures text content */
  measure?(node: EnrichedNode, maxWidth: number): Dimensions;
  component: ComponentType<PluginComponentProps>;
}

export interface PluginComponentProps {
  node: EnrichedNode;
  isStreaming?: boolean;
}

// ── Stream event types ─────────────────────────────────────────────

export type StreamEvent =
  | { type: "block:new"; blockId: number }
  | { type: "block:update"; blockId: number }
  | { type: "block:complete"; blockId: number }
  | { type: "stream:end" };

// ── Inkset options ───────────────────────────────────────────────

export type HyphenationOption =
  | boolean
  | { lang: "en-us" };

/**
 * CSS `text-wrap` values. `"pretty"` asks the browser for its best
 * line-breaking (Knuth-Plass-like on modern Chrome/Safari), `"balance"` evens
 * out line lengths. Both are progressive enhancements — older browsers ignore
 * them. Pretext measures greedy, so line-count drift is possible but small.
 */
export type TextWrapOption = "wrap" | "balance" | "pretty" | "stable";

/**
 * Which blocks to shrinkwrap: narrow each applicable block to the width of
 * its longest greedy-wrapped line. The visual effect is balanced paragraphs
 * and headings (no trailing whitespace after the last line) without needing
 * CSS `text-wrap: balance`.
 *
 * - `false` (default): no shrinkwrap.
 * - `"headings"`: apply to heading blocks only. Usually the best-looking
 *   default — heading text often has a short trailing fragment that looks
 *   ragged.
 * - `"paragraphs"`: apply to paragraphs and blockquotes.
 * - `true`: apply to everything text-shaped (headings, paragraphs,
 *   blockquotes, list items).
 */
export type ShrinkwrapOption =
  | boolean
  | "headings"
  | "paragraphs";

/**
 * Heading metric tuples indexed h1..h4 (h5 and h6 inherit h4). Kept as fixed-
 * length tuples rather than objects because measurement is hot and indexed
 * access is cheaper than property lookup.
 *
 * - HeadingSizeTuple: multipliers of base `fontSize` (e.g. [3, 2.15, 1.3, 1])
 * - HeadingWeightTuple: CSS weight numbers (e.g. [800, 780, 720, 680])
 * - HeadingLineHeightTuple: multipliers of the heading's own fontSize
 */
export type HeadingSizeTuple = readonly [number, number, number, number];
export type HeadingWeightTuple = readonly [number, number, number, number];
export type HeadingLineHeightTuple = readonly [number, number, number, number];

export interface InksetOptions {
  plugins?: InksetPlugin[];
  /** Must match CSS font-family */
  font?: string;
  fontSize?: number;
  lineHeight?: number;
  blockMargin?: number;
  cacheSize?: number;
  /**
   * Insert soft hyphens so Pretext and the browser can break long words on
   * syllable boundaries. `true` defaults to en-us. Pair with `hyphens: manual`
   * (or `auto`) in CSS for the breaks to render.
   */
  hyphenation?: HyphenationOption;
  /** Sets CSS `text-wrap` on the inkset root. */
  textWrap?: TextWrapOption;
  /**
   * Size multipliers per heading level (h1..h4) applied to `fontSize` during
   * measurement. Must match the CSS `--inkset-heading-N-size` the consumer
   * renders with, or layout will reserve the wrong block height.
   */
  headingSizes?: HeadingSizeTuple;
  /** CSS font weights per heading level (h1..h4) used during measurement. */
  headingWeights?: HeadingWeightTuple;
  /**
   * Line-height multipliers per heading level (h1..h4) relative to that
   * heading's computed fontSize.
   */
  headingLineHeights?: HeadingLineHeightTuple;
  /**
   * Balance text by narrowing each applicable block to its longest greedy
   * line. Cheaper and more compatible than CSS `text-wrap: balance` since
   * pretext already does the measurement.
   */
  shrinkwrap?: ShrinkwrapOption;
}

// ── Error types ────────────────────────────────────────────────────

export class InksetError extends Error {
  constructor(
    message: string,
    public readonly layer: string,
    public readonly blockId?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "InksetError";
  }
}
