// Parse layer: converts raw markdown blocks into HAST-compatible AST nodes via unified.
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import type { ASTNode, Block, BlockType } from "./types";

// ── Processor cache ────────────────────────────────────────────────

let cachedProcessor: { parse(doc: string): unknown; runSync(node: unknown): unknown } | null = null;

const getProcessor = () => {
  if (!cachedProcessor) {
    cachedProcessor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype, { allowDangerousHtml: true });
  }
  return cachedProcessor;
};

// ── Block type detection ───────────────────────────────────────────

const MATH_ENV_RE =
  /^\\begin\{(equation|align|aligned|gather|gathered|alignat|alignedat|multline|split|array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|Bmatrix|cases|dcases|rcases|smallmatrix|subarray|CD)\*?\}/;

const detectBlockType = (raw: string): BlockType => {
  const trimmed = raw.trimStart();

  if (trimmed.match(/^(`{3,}|~{3,})/)) return "code";
  if (trimmed.startsWith("$$")) return "math-display";
  if (MATH_ENV_RE.test(trimmed)) return "math-display";
  if (trimmed.match(/^#{1,6}\s/)) return "heading";
  if (trimmed.startsWith("|")) return "table";
  if (trimmed.match(/^[-*+]\s/) || trimmed.match(/^\d+\.\s/)) return "list";
  if (trimmed.startsWith(">")) return "blockquote";
  if (trimmed.startsWith("<")) return "html";
  if (trimmed.match(/^([-*_]){3,}\s*$/)) return "thematic-break";

  return "paragraph";
};

// ── Block parsing ──────────────────────────────────────────────────

export const createBlocks = (rawBlocks: readonly string[]): Block[] => {
  return rawBlocks.map((raw, i) => ({
    id: i,
    raw,
    type: detectBlockType(raw),
    hot: i === rawBlocks.length - 1, // last block is hot during streaming
  }));
};

export const parseBlock = (block: Readonly<Block>): ASTNode => {
  // Math blocks bypass remark: CommonMark escape handling collapses `\\`
  // → `\` and `\{` → `{`, which destroys LaTeX line breaks and command
  // boundaries. The math plugin wants the verbatim source.
  if (block.type === "math-display") {
    return {
      type: "element",
      tagName: "div",
      properties: {},
      children: [{ type: "text", value: block.raw, blockId: block.id, blockType: block.type }],
      blockId: block.id,
      blockType: block.type,
    };
  }

  const processor = getProcessor();

  try {
    const mdast = processor.parse(block.raw);
    // unified's generic types don't track the mdast->hast conversion across .use() calls,
    // so we assert the output shape which remark-rehype guarantees at runtime.
    const hast = processor.runSync(mdast) as HastNode;

    return hastToASTNode(hast, block.id, block.type);
  } catch (err) {
    // Degrade gracefully: return raw text as a paragraph
    console.warn(`[inkset] Parse error for block ${block.id}:`, err);
    return {
      type: "element",
      tagName: "p",
      properties: {},
      children: [{ type: "text", value: block.raw, blockId: block.id, blockType: block.type }],
      blockId: block.id,
      blockType: block.type,
    };
  }
};

export type ParseResult = {
  nodes: ASTNode[];
  parsedBlockIds: Set<number>;
};

/** Only re-parses hot or uncached blocks; frozen blocks reuse cached AST nodes. */
export const parseBlocks = (blocks: readonly Block[], cache: Map<number, ASTNode>): ParseResult => {
  const nodes: ASTNode[] = [];
  const parsedBlockIds = new Set<number>();

  for (const block of blocks) {
    if (!block.hot && cache.has(block.id)) {
      nodes.push(cache.get(block.id)!);
    } else {
      const node = parseBlock(block);
      cache.set(block.id, node);
      nodes.push(node);
      parsedBlockIds.add(block.id);
    }
  }

  return { nodes, parsedBlockIds };
};

// ── HAST conversion ────────────────────────────────────────────────

type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: string;
};

const hastToASTNode = (hast: HastNode, blockId: number, blockType: BlockType): ASTNode => {
  const node: ASTNode = {
    type: hast.type,
    blockId,
    blockType,
  };

  if (hast.tagName) node.tagName = hast.tagName;
  if (hast.properties) node.properties = hast.properties;
  if (hast.value !== undefined) node.value = hast.value;

  if (hast.children) {
    node.children = hast.children.map((child) => hastToASTNode(child, blockId, blockType));
  }

  return node;
};

/** Recursively extracts all text content from an AST subtree for measurement. */
export const extractText = (node: Readonly<ASTNode>): string => {
  if (node.value) return node.value;
  if (!node.children) return "";
  return node.children.map(extractText).join("");
};
