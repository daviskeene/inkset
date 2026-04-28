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
  const protectedInlineMath = block.type === "code" ? null : protectInlineMath(block.raw);

  try {
    const mdast = processor.parse(protectedInlineMath?.markdown ?? block.raw);
    // unified's generic types don't track the mdast->hast conversion across .use() calls,
    // so we assert the output shape which remark-rehype guarantees at runtime.
    const hast = processor.runSync(mdast) as HastNode;

    const node = hastToASTNode(hast, block.id, block.type);
    if (!protectedInlineMath) return node;
    return restoreInlineMathPlaceholders(node, protectedInlineMath.math, block.id, block.type);
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

type ProtectedInlineMath = {
  markdown: string;
  math: string[];
};

const INLINE_MATH_PLACEHOLDER_PREFIX = "\uE000INKSET_INLINE_MATH_";
const INLINE_MATH_PLACEHOLDER_SUFFIX = "\uE001";
const INLINE_MATH_PLACEHOLDER_RE = /\uE000INKSET_INLINE_MATH_(\d+)\uE001/g;

const protectInlineMath = (raw: string): ProtectedInlineMath => {
  const math: string[] = [];
  const markdown = protectInlineMathInText(raw, math);

  return { markdown, math };
};

const protectInlineMathInText = (text: string, math: string[]): string => {
  let markdown = "";
  let cursor = 0;

  while (cursor < text.length) {
    const protectedSpan = findProtectedMarkdownSpan(text, cursor);
    const start = findInlineMathDelimiter(text, cursor, true);
    if (start === -1 || (protectedSpan && protectedSpan.start < start)) {
      const end = protectedSpan?.end ?? text.length;
      markdown += text.slice(cursor, end);
      cursor = end;
      if (!protectedSpan) {
        break;
      }
      continue;
    }

    if (protectedSpan && protectedSpan.start === start) {
      markdown += text.slice(cursor, protectedSpan.end);
      cursor = protectedSpan.end;
      continue;
    }

    const end = findInlineMathDelimiter(text, start + 1, false);
    if (end === -1) {
      markdown += text.slice(cursor);
      break;
    }

    const closingProtectedSpan = findProtectedMarkdownSpan(text, start + 1);
    if (closingProtectedSpan && closingProtectedSpan.start < end) {
      markdown += text.slice(cursor, closingProtectedSpan.end);
      cursor = closingProtectedSpan.end;
      continue;
    }

    markdown += text.slice(cursor, start);
    const value = text.slice(start + 1, end);
    if (value.length === 0) {
      markdown += "$$";
      cursor = end + 1;
      continue;
    }

    const index = math.push(value) - 1;
    markdown += `${INLINE_MATH_PLACEHOLDER_PREFIX}${index}${INLINE_MATH_PLACEHOLDER_SUFFIX}`;
    cursor = end + 1;
  }

  return markdown;
};

type ProtectedMarkdownSpan = {
  start: number;
  end: number;
};

const findProtectedMarkdownSpan = (
  text: string,
  fromIndex: number,
): ProtectedMarkdownSpan | null => {
  let best: ProtectedMarkdownSpan | null = null;

  const codeSpan = findInlineCodeSpan(text, fromIndex);
  if (codeSpan) best = codeSpan;

  const linkDestination = findInlineLinkDestination(text, fromIndex);
  if (linkDestination && (!best || linkDestination.start < best.start)) {
    best = linkDestination;
  }

  return best;
};

const findInlineCodeSpan = (text: string, fromIndex: number): ProtectedMarkdownSpan | null => {
  for (let index = fromIndex; index < text.length; index++) {
    if (text[index] !== "`") continue;

    let tickCount = 1;
    while (text[index + tickCount] === "`") {
      tickCount++;
    }

    const delimiter = "`".repeat(tickCount);
    const end = text.indexOf(delimiter, index + tickCount);
    if (end === -1) {
      return null;
    }

    return { start: index, end: end + tickCount };
  }

  return null;
};

const findInlineLinkDestination = (
  text: string,
  fromIndex: number,
): ProtectedMarkdownSpan | null => {
  for (let index = fromIndex; index < text.length; index++) {
    if (text[index] !== "[") continue;

    const labelEnd = findUnescaped(text, "]", index + 1);
    if (labelEnd === -1 || text[labelEnd + 1] !== "(") {
      continue;
    }

    const destinationStart = labelEnd + 2;
    const destinationEnd = findLinkDestinationEnd(text, destinationStart);
    if (destinationEnd === -1) {
      return null;
    }

    return { start: destinationStart, end: destinationEnd };
  }

  return null;
};

const findLinkDestinationEnd = (text: string, fromIndex: number): number => {
  let depth = 0;

  for (let index = fromIndex; index < text.length; index++) {
    const char = text[index];
    if (text[index - 1] === "\\") continue;

    if (char === "(") {
      depth++;
      continue;
    }

    if (char === ")") {
      if (depth === 0) return index;
      depth--;
    }
  }

  return -1;
};

const findUnescaped = (text: string, target: string, fromIndex: number): number => {
  for (let index = fromIndex; index < text.length; index++) {
    if (text[index] !== target) continue;
    if (text[index - 1] === "\\") continue;
    return index;
  }

  return -1;
};

const findInlineMathDelimiter = (text: string, fromIndex: number, opening: boolean): number => {
  for (let index = fromIndex; index < text.length; index++) {
    if (text[index] !== "$") continue;
    if (text[index - 1] === "\\") continue;
    if (text[index - 1] === "$" || text[index + 1] === "$") continue;
    if (opening && /\s/.test(text[index + 1] ?? "")) continue;
    if (opening && /\d/.test(text[index + 1] ?? "")) continue;
    if (!opening && /\s/.test(text[index - 1] ?? "")) continue;
    return index;
  }

  return -1;
};

const restoreInlineMathPlaceholders = (
  node: ASTNode,
  math: readonly string[],
  blockId: number,
  blockType: BlockType,
): ASTNode => {
  if (math.length === 0) return node;
  if (!node.children) return node;

  const children: ASTNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string") {
      children.push(...splitInlineMathPlaceholders(child, math, blockId, blockType));
    } else {
      children.push(restoreInlineMathPlaceholders(child, math, blockId, blockType));
    }
  }

  return { ...node, children };
};

const splitInlineMathPlaceholders = (
  node: ASTNode,
  math: readonly string[],
  blockId: number,
  blockType: BlockType,
): ASTNode[] => {
  const value = node.value ?? "";
  const children: ASTNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  INLINE_MATH_PLACEHOLDER_RE.lastIndex = 0;
  while ((match = INLINE_MATH_PLACEHOLDER_RE.exec(value)) !== null) {
    if (match.index > cursor) {
      children.push({
        ...node,
        value: value.slice(cursor, match.index),
      });
    }

    const latex = math[Number(match[1])] ?? "";
    children.push({
      type: "inlineMath",
      value: latex,
      blockId,
      blockType,
    });
    cursor = match.index + match[0].length;
  }

  if (cursor < value.length) {
    children.push({
      ...node,
      value: value.slice(cursor),
    });
  }

  return children;
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
