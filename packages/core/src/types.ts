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

export interface Block {
  /** Stable index-based identity */
  id: number;
  /** Raw markdown source for this block */
  raw: string;
  /** Block type determined by marked lexer */
  type: BlockType;
  /** Whether this block is still receiving streaming tokens */
  hot: boolean;
}

// ── AST types (post-parse) ─────────────────────────────────────────

/** HAST-compatible node from the unified pipeline */
export interface ASTNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: ASTNode[];
  value?: string;
  /** Which block this node belongs to */
  blockId: number;
  /** Original block type */
  blockType: BlockType;
  /** Code fence language (for code blocks) */
  lang?: string;
  /** Code fence metadata (for code blocks) */
  meta?: string;
}

// ── Enriched AST (post-transform) ──────────────────────────────────

export interface EnrichedNode extends ASTNode {
  /** Plugin-specific rendering data */
  pluginData?: Record<string, unknown>;
  /** Name of the plugin that transformed this node */
  transformedBy?: string;
}

// ── Measurement types ──────────────────────────────────────────────

export interface Dimensions {
  width: number;
  height: number;
}

export interface MeasuredBlock {
  blockId: number;
  node: EnrichedNode;
  dimensions: Dimensions;
  /** Opaque handle from pretext.prepare() — reused across layouts */
  preparedHandle?: unknown;
}

// ── Layout types ───────────────────────────────────────────────────

export interface LayoutBlock {
  blockId: number;
  x: number;
  y: number;
  width: number;
  height: number;
  node: EnrichedNode;
}

export type LayoutTree = LayoutBlock[];

// ── Plugin types ───────────────────────────────────────────────────

export interface PluginContext {
  /** Current container width in px */
  containerWidth: number;
  /** Whether the stream is still active */
  isStreaming: boolean;
}

export interface PreframePlugin {
  /** Unique plugin name */
  name: string;
  /** AST node types this plugin handles (e.g., "code", "math-display") */
  handles: string[];
  /** If true, transform() re-runs when container width changes */
  widthSensitive?: boolean;
  /** Transform an AST node into an enriched node with plugin data */
  transform(node: ASTNode, ctx: PluginContext): EnrichedNode;
  /** Measure the rendered dimensions. If omitted, pretext measures text content. */
  measure?(node: EnrichedNode, maxWidth: number): Dimensions;
  /** React component to render this node type */
  component: ComponentType<PluginComponentProps>;
}

export interface PluginComponentProps {
  node: EnrichedNode;
  /** Whether this block is still receiving streaming content */
  isStreaming?: boolean;
}

// ── Stream event types ─────────────────────────────────────────────

export type StreamEvent =
  | { type: "block:new"; blockId: number }
  | { type: "block:update"; blockId: number }
  | { type: "block:complete"; blockId: number }
  | { type: "stream:end" };

// ── Preframe options ───────────────────────────────────────────────

export interface PreframeOptions {
  /** Plugins to apply to the rendering pipeline */
  plugins?: PreframePlugin[];
  /** Font family used for pretext measurement. Must match CSS. */
  font?: string;
  /** Font size in px for pretext measurement. Default: 16 */
  fontSize?: number;
  /** Line height in px for pretext layout. Default: 24 */
  lineHeight?: number;
  /** Block margin in px. Default: 16 */
  blockMargin?: number;
  /** Maximum LRU cache entries for prepare() handles. Default: 500 */
  cacheSize?: number;
}

// ── Error types ────────────────────────────────────────────────────

export class PreframeError extends Error {
  constructor(
    message: string,
    public readonly layer: string,
    public readonly blockId?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PreframeError";
  }
}
