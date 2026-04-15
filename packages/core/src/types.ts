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

export interface Block {
  id: number;
  raw: string;
  type: BlockType;
  /** Whether this block is still receiving streaming tokens */
  hot: boolean;
}

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

export interface Dimensions {
  width: number;
  height: number;
}

export interface MeasuredBlock {
  blockId: number;
  node: EnrichedNode;
  dimensions: Dimensions;
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
  containerWidth: number;
  isStreaming: boolean;
}

export interface PreframePlugin {
  name: string;
  /** AST node types this plugin handles (e.g., "code", "math-display") */
  handles: string[];
  /** If true, transform() re-runs when container width changes */
  widthSensitive?: boolean;
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

// ── Preframe options ───────────────────────────────────────────────

export interface PreframeOptions {
  plugins?: PreframePlugin[];
  /** Must match CSS font-family */
  font?: string;
  fontSize?: number;
  lineHeight?: number;
  blockMargin?: number;
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
