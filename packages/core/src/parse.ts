import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import type { ASTNode, Block, BlockType } from "./types";

// ── Processor cache ────────────────────────────────────────────────

let cachedProcessor: { parse(doc: string): unknown; runSync(node: unknown): unknown } | null = null;

function getProcessor() {
  if (!cachedProcessor) {
    cachedProcessor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype, { allowDangerousHtml: true });
  }
  return cachedProcessor;
}

// ── Block type detection ───────────────────────────────────────────

function detectBlockType(raw: string): BlockType {
  const trimmed = raw.trimStart();

  if (trimmed.match(/^(`{3,}|~{3,})/)) return "code";
  if (trimmed.startsWith("$$")) return "math-display";
  if (trimmed.match(/^#{1,6}\s/)) return "heading";
  if (trimmed.startsWith("|")) return "table";
  if (trimmed.match(/^[-*+]\s/) || trimmed.match(/^\d+\.\s/)) return "list";
  if (trimmed.startsWith(">")) return "blockquote";
  if (trimmed.startsWith("<")) return "html";
  if (trimmed.match(/^([-*_]){3,}\s*$/)) return "thematic-break";

  return "paragraph";
}

// ── Block parsing ──────────────────────────────────────────────────

/**
 * Parse raw block strings into Block objects with type detection.
 */
export function createBlocks(rawBlocks: string[]): Block[] {
  return rawBlocks.map((raw, i) => ({
    id: i,
    raw,
    type: detectBlockType(raw),
    hot: i === rawBlocks.length - 1, // last block is hot during streaming
  }));
}

/**
 * Parse a single block's markdown into a HAST-compatible AST node.
 * Uses the cached unified pipeline (remark-parse -> remark-gfm -> remark-rehype).
 */
export function parseBlock(block: Block): ASTNode {
  const processor = getProcessor();

  try {
    // Parse markdown to MDAST, then transform to HAST
    const mdast = processor.parse(block.raw);
    // unified's generic types don't track the mdast->hast conversion across .use() calls,
    // so we assert the output shape which remark-rehype guarantees at runtime.
    const hast = processor.runSync(mdast) as HastNode;

    return hastToASTNode(hast, block.id, block.type);
  } catch (err) {
    // Degrade gracefully: return raw text as a paragraph
    console.warn(`[preframe] Parse error for block ${block.id}:`, err);
    return {
      type: "element",
      tagName: "p",
      properties: {},
      children: [{ type: "text", value: block.raw, blockId: block.id, blockType: block.type }],
      blockId: block.id,
      blockType: block.type,
    };
  }
}

export interface ParseResult {
  nodes: ASTNode[];
  parsedBlockIds: Set<number>;
}

/**
 * Parse multiple blocks. Only re-parses blocks that have changed (hot blocks).
 * Returns both the parsed nodes and the set of block IDs that were freshly parsed,
 * so downstream layers (transform, measure) know which blocks need reprocessing.
 */
export function parseBlocks(
  blocks: Block[],
  cache: Map<number, ASTNode>,
): ParseResult {
  const nodes: ASTNode[] = [];
  const parsedBlockIds = new Set<number>();

  for (const block of blocks) {
    if (!block.hot && cache.has(block.id)) {
      // Frozen block with cached parse — reuse
      nodes.push(cache.get(block.id)!);
    } else {
      // Hot block or uncached — parse
      const node = parseBlock(block);
      cache.set(block.id, node);
      nodes.push(node);
      parsedBlockIds.add(block.id);
    }
  }

  return { nodes, parsedBlockIds };
}

// ── HAST conversion ────────────────────────────────────────────────

interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: string;
}

function hastToASTNode(
  hast: HastNode,
  blockId: number,
  blockType: BlockType,
): ASTNode {
  const node: ASTNode = {
    type: hast.type,
    blockId,
    blockType,
  };

  if (hast.tagName) node.tagName = hast.tagName;
  if (hast.properties) node.properties = hast.properties;
  if (hast.value !== undefined) node.value = hast.value;

  if (hast.children) {
    node.children = hast.children.map((child) =>
      hastToASTNode(child, blockId, blockType),
    );
  }

  return node;
}

/**
 * Extract plain text from an AST node tree (for pretext measurement).
 */
export function extractText(node: ASTNode): string {
  if (node.value) return node.value;
  if (!node.children) return "";
  return node.children.map(extractText).join("");
}
