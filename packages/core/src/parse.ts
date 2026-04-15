import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import type { ASTNode, Block, BlockType } from "./types.js";

// ── Processor cache ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedProcessor: any = null;

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
    const hast = processor.runSync(mdast) as unknown as HastNode;

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

/**
 * Parse multiple blocks. Only re-parses blocks that have changed.
 * Uses the frozenOffset to skip already-parsed blocks.
 */
export function parseBlocks(
  blocks: Block[],
  cache: Map<number, ASTNode>,
): ASTNode[] {
  const result: ASTNode[] = [];

  for (const block of blocks) {
    if (!block.hot && cache.has(block.id)) {
      // Frozen block with cached parse — reuse
      result.push(cache.get(block.id)!);
    } else {
      // Hot block or uncached — parse
      const node = parseBlock(block);
      cache.set(block.id, node);
      result.push(node);
    }
  }

  return result;
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
