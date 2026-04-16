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
};

// ── Layout types ───────────────────────────────────────────────────

export type LayoutBlock = {
  blockId: number;
  x: number;
  y: number;
  width: number;
  height: number;
  node: EnrichedNode;
};

export type LayoutTree = LayoutBlock[];

// ── Plugin types ───────────────────────────────────────────────────

export type PluginContext = {
  containerWidth: number;
  isStreaming: boolean;
};

export interface InksetPlugin {
  name: string;
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
