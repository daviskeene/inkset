// Parse layer: converts raw markdown blocks into HAST-compatible AST nodes via unified.
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import type { ASTNode, Block, BlockReferences, BlockType } from "./types";

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

const FOOTNOTE_DEFINITION_RE = /^ {0,3}\[\^([^\]\s]+)\]:/;

const detectBlockType = (raw: string): BlockType => {
  const trimmed = raw.trimStart();

  if (trimmed.match(/^(`{3,}|~{3,})/)) return "code";
  if (trimmed.startsWith("$$")) return "math-display";
  if (MATH_ENV_RE.test(trimmed)) return "math-display";
  if (trimmed.match(/^#{1,6}\s/)) return "heading";
  if (trimmed.startsWith("|")) return "table";
  if (trimmed.match(/^[-*+]\s/) || trimmed.match(/^\d+\.\s/)) return "list";
  if (trimmed.startsWith(">")) return "blockquote";
  // Only tag-shaped starts count as HTML (`<div`, `</p>`, `<br/>`, `<!--`,
  // `<!DOCTYPE`). A paragraph like "<3 this idea" stays a paragraph.
  if (/^<(?:[a-zA-Z][a-zA-Z0-9-]*(?:[\s/>]|$)|\/[a-zA-Z]|!)/.test(trimmed)) return "html";
  if (trimmed.match(/^([-*_]){3,}\s*$/)) return "thematic-break";
  if (FOOTNOTE_DEFINITION_RE.test(raw)) return "footnotes";

  return "paragraph";
};

// ── Document-level references ──────────────────────────────────────

/**
 * Definitions collected from the whole document. Blocks are parsed in
 * isolation, so a `[^1]` reference in paragraph 2 cannot see the `[^1]: …`
 * definition in paragraph 9 unless it is re-supplied at parse time; the same
 * goes for `[text][label]` reference links. `collectDocumentReferences()`
 * gathers them once per pipeline run and `createBlocks()` attaches the
 * relevant subset to each block.
 */
export type DocumentReferences = {
  /** Link and image reference definitions, one per line. */
  linkDefinitions: string;
  /** Footnote definitions, one block per definition group. */
  footnoteDefinitions: string;
  /**
   * Footnote labels (normalized like remark: lowercased) in order of first
   * reference across the document. Only labels that have a definition are
   * listed, and this order is what numbers the rendered references.
   */
  footnoteOrder: readonly string[];
};

// A link reference definition line: `[label]: destination` (footnote labels,
// which start with `^`, are excluded). The destination must start on the same
// line; CommonMark allows it on the next line, but LLM output never does.
const LINK_DEFINITION_LINE_RE = /^ {0,3}\[(?!\^)(?:[^[\]\\]|\\.)+\]:[ \t]*\S/;
const FOOTNOTE_DEFINITION_LINE_RE = /^ {0,3}\[\^([^\]\s]+)\]:/gm;
const FOOTNOTE_REFERENCE_RE = /\[\^([^\]\s]+)\](?!:)/g;
const INLINE_CODE_SPAN_RE = /(`+)[^`]*?\1/g;
const EMPTY_ORDER: readonly string[] = [];

/** Mirrors remark's footnote identifier normalization (case-folded). */
const normalizeFootnoteLabel = (label: string): string =>
  label
    .replace(/[\t\n\r ]+/g, " ")
    .trim()
    .toLowerCase()
    .toUpperCase()
    .toLowerCase();

/** Leading lines of a block that are link reference definitions, or null. */
const extractLinkDefinitions = (raw: string): string | null => {
  const definitions: string[] = [];
  for (const line of raw.split("\n")) {
    if (!LINK_DEFINITION_LINE_RE.test(line)) break;
    definitions.push(line);
  }
  return definitions.length > 0 ? definitions.join("\n") : null;
};

/**
 * Collects reference definitions from the split document and normalizes the
 * block list: footnote definition blocks are removed from wherever they sit
 * and merged into a single `footnotes` block at the end, which is where GFM
 * renders them. Returns the (possibly reordered) blocks plus the references
 * to hand to `createBlocks()`; `references` is null when the document has
 * no definitions at all, so the common case costs one scan and nothing else.
 */
export const collectDocumentReferences = (
  rawBlocks: readonly string[],
): { blocks: string[]; references: DocumentReferences | null } => {
  const linkDefinitions: string[] = [];
  const footnoteDefinitions: string[] = [];
  const definedLabels = new Set<string>();
  const kept: string[] = [];

  for (const raw of rawBlocks) {
    if (FOOTNOTE_DEFINITION_RE.test(raw)) {
      footnoteDefinitions.push(raw);
      FOOTNOTE_DEFINITION_LINE_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = FOOTNOTE_DEFINITION_LINE_RE.exec(raw)) !== null) {
        definedLabels.add(normalizeFootnoteLabel(match[1]));
      }
      continue;
    }

    if (raw.includes("]:") && !raw.trimStart().startsWith("```")) {
      const definitions = extractLinkDefinitions(raw);
      if (definitions) linkDefinitions.push(definitions);
    }
    kept.push(raw);
  }

  if (linkDefinitions.length === 0 && footnoteDefinitions.length === 0) {
    return { blocks: rawBlocks as string[], references: null };
  }

  const footnoteOrder: string[] = [];
  if (definedLabels.size > 0) {
    const seen = new Set<string>();
    for (const raw of kept) {
      if (!raw.includes("[^")) continue;
      const type = detectBlockType(raw);
      if (type === "code" || type === "math-display") continue;
      const prose = raw.replace(INLINE_CODE_SPAN_RE, "");
      FOOTNOTE_REFERENCE_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = FOOTNOTE_REFERENCE_RE.exec(prose)) !== null) {
        const label = normalizeFootnoteLabel(match[1]);
        if (definedLabels.has(label) && !seen.has(label)) {
          seen.add(label);
          footnoteOrder.push(label);
        }
      }
    }
  }

  const blocks =
    footnoteDefinitions.length > 0 ? [...kept, footnoteDefinitions.join("\n\n")] : kept;

  return {
    blocks,
    references: {
      linkDefinitions: linkDefinitions.join("\n"),
      footnoteDefinitions: footnoteDefinitions.join("\n\n"),
      footnoteOrder,
    },
  };
};

/**
 * Picks the definitions a block needs. Any `[` may be a reference link, so
 * link definitions ride along with every prose block when they exist; footnote
 * definitions (and the numbering order) only go to blocks that contain `[^`,
 * keeping unrelated frozen blocks' cache keys stable while a footnote streams.
 */
const resolveBlockReferences = (
  raw: string,
  type: BlockType,
  doc: DocumentReferences,
): BlockReferences | undefined => {
  if (type === "code" || type === "math-display") return undefined;

  if (type === "footnotes") {
    return {
      definitions: doc.linkDefinitions,
      footnoteOrder: doc.footnoteOrder,
      key: `footnotes${doc.footnoteOrder.join(",")}${doc.linkDefinitions}`,
    };
  }

  if (!raw.includes("[")) return undefined;

  const wantsFootnotes = doc.footnoteOrder.length > 0 && raw.includes("[^");
  const wantsLinks = doc.linkDefinitions.length > 0;
  if (!wantsFootnotes && !wantsLinks) return undefined;

  const parts: string[] = [];
  if (wantsLinks) parts.push(doc.linkDefinitions);
  if (wantsFootnotes) parts.push(doc.footnoteDefinitions);
  const definitions = parts.join("\n\n");
  const footnoteOrder = wantsFootnotes ? doc.footnoteOrder : EMPTY_ORDER;

  return {
    definitions,
    footnoteOrder,
    key: `${footnoteOrder.join(",")}${definitions}`,
  };
};

// ── Block parsing ──────────────────────────────────────────────────

export const createBlocks = (
  rawBlocks: readonly string[],
  references?: DocumentReferences | null,
): Block[] => {
  return rawBlocks.map((raw, i) => {
    const type = detectBlockType(raw);
    const block: Block = {
      id: i,
      raw,
      type,
      hot: i === rawBlocks.length - 1, // last block is hot during streaming
    };
    if (references) {
      const blockReferences = resolveBlockReferences(raw, type, references);
      if (blockReferences) block.references = blockReferences;
    }
    return block;
  });
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
  const references = block.references;

  let markdown = protectedInlineMath?.markdown ?? block.raw;
  if (block.type === "footnotes") {
    // The merged definitions block renders the footnote list. remark-gfm only
    // emits entries for referenced footnotes, in reference order, so feed it a
    // synthetic paragraph of references (document order) ahead of the
    // definitions and keep just the generated section.
    const synthetic = (references?.footnoteOrder ?? EMPTY_ORDER)
      .map((label) => `[^${label}]`)
      .join(" ");
    markdown = synthetic ? `${synthetic}\n\n${markdown}` : markdown;
  }
  if (references && references.definitions) {
    markdown = `${markdown}\n\n${references.definitions}`;
  }

  try {
    const mdast = processor.parse(markdown);
    // unified's generic types don't track the mdast->hast conversion across .use() calls,
    // so we assert the output shape which remark-rehype guarantees at runtime.
    const hast = processor.runSync(mdast) as HastNode;

    let node = hastToASTNode(hast, block.id, block.type);
    if (block.type === "footnotes") {
      node = keepFootnoteSection(node);
    } else if (references && references.footnoteOrder.length > 0) {
      node = stripAndRenumberFootnotes(node, references.footnoteOrder);
    }
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
    const value = text.slice(start + 1, end).trim();
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
    if (!opening && /\d/.test(text[index + 1] ?? "")) continue;
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

export type ParseCacheEntry = {
  raw: string;
  node: ASTNode;
  /** Identity of the document references the node was parsed with. */
  referencesKey?: string;
};

/**
 * Only re-parses hot, uncached, or content-changed blocks; frozen blocks with
 * unchanged raw text reuse cached AST nodes. The raw-text check matters:
 * `repair()` can rewrite a block after it froze (e.g. `\eqref{name}` resolving
 * once a later `\label` arrives), so block index alone is not a valid cache key.
 * The references key matters for the same reason: a footnote or link
 * definition arriving late must re-resolve the frozen blocks that cite it.
 */
export const parseBlocks = (
  blocks: readonly Block[],
  cache: Map<number, ParseCacheEntry>,
): ParseResult => {
  const nodes: ASTNode[] = [];
  const parsedBlockIds = new Set<number>();

  for (const block of blocks) {
    const cached = cache.get(block.id);
    if (
      !block.hot &&
      cached &&
      cached.raw === block.raw &&
      cached.referencesKey === block.references?.key
    ) {
      nodes.push(cached.node);
    } else {
      const node = parseBlock(block);
      cache.set(block.id, { raw: block.raw, node, referencesKey: block.references?.key });
      nodes.push(node);
      parsedBlockIds.add(block.id);
    }
  }

  return { nodes, parsedBlockIds };
};

// ── Footnote post-processing ───────────────────────────────────────

const FOOTNOTE_HREF_PREFIX = "#user-content-fn-";

const isFootnoteSection = (node: ASTNode): boolean =>
  node.type === "element" &&
  node.tagName === "section" &&
  node.properties?.["data-footnotes"] !== undefined;

/** Keeps only remark's generated footnote section (or nothing). */
const keepFootnoteSection = (root: ASTNode): ASTNode => {
  const section = root.children?.find(isFootnoteSection);
  return { ...root, children: section ? [section] : [] };
};

/**
 * Referencing blocks parse with the definitions appended, which makes remark
 * emit its own footnote section and number references 1..n per block. Drop
 * the section (the merged `footnotes` block renders it once) and renumber
 * each reference by its document-level order.
 */
const stripAndRenumberFootnotes = (node: ASTNode, order: readonly string[]): ASTNode => {
  if (!node.children) return node;

  let changed = false;
  const children: ASTNode[] = [];
  for (const child of node.children) {
    if (isFootnoteSection(child)) {
      changed = true;
      continue;
    }

    if (
      child.type === "element" &&
      child.tagName === "a" &&
      child.properties?.["data-footnote-ref"] !== undefined
    ) {
      const href = String(child.properties.href ?? "");
      const label = href.startsWith(FOOTNOTE_HREF_PREFIX)
        ? safeDecode(href.slice(FOOTNOTE_HREF_PREFIX.length))
        : "";
      const index = order.indexOf(label);
      if (index !== -1) {
        changed = true;
        children.push({
          ...child,
          children: [
            {
              type: "text",
              value: String(index + 1),
              blockId: child.blockId,
              blockType: child.blockType,
            },
          ],
        });
        continue;
      }
    }

    const next = stripAndRenumberFootnotes(child, order);
    if (next !== child) changed = true;
    children.push(next);
  }

  return changed ? { ...node, children } : node;
};

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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
  if (hast.properties) node.properties = normalizeProperties(hast.properties);
  if (hast.value !== undefined) node.value = hast.value;

  if (hast.children) {
    const children: ASTNode[] = [];
    for (const child of hast.children) {
      const converted = convertHastChild(child, blockId, blockType);
      if (converted) children.push(converted);
    }
    node.children = children;
  }

  return node;
};

// Raw HTML policy. Markdown HTML arrives as `raw` nodes holding the literal
// tag text; Inkset does not run an HTML parser or sanitizer, so raw HTML is
// dropped rather than rendered (the same default as react-markdown). Two
// harmless, common shapes are kept because dropping them loses meaning:
//   - `<a id="…"></a>` / `<a name="…">` scroll anchors → an empty <a id>
//   - `<br>` → a line break
// Comments and everything else contribute nothing, so an anchor-only or
// comment-only block measures at zero height and takes no layout space.
const RAW_ANCHOR_RE = /^<a\s+(?:id|name)\s*=\s*(?:"([A-Za-z][\w:.-]*)"|'([A-Za-z][\w:.-]*)')\s*>$/i;
const RAW_BR_RE = /^<br\s*\/?>$/i;

const convertRawNode = (hast: HastNode, blockId: number, blockType: BlockType): ASTNode | null => {
  const value = (hast.value ?? "").trim();

  if (RAW_BR_RE.test(value)) {
    return { type: "element", tagName: "br", properties: {}, children: [], blockId, blockType };
  }

  const anchor = RAW_ANCHOR_RE.exec(value);
  if (anchor) {
    return {
      type: "element",
      tagName: "a",
      properties: { id: anchor[1] ?? anchor[2] },
      children: [],
      blockId,
      blockType,
    };
  }

  return null;
};

const convertHastChild = (
  hast: HastNode,
  blockId: number,
  blockType: BlockType,
): ASTNode | null => {
  if (hast.type === "raw") return convertRawNode(hast, blockId, blockType);
  if (hast.type === "comment" || hast.type === "doctype") return null;
  return hastToASTNode(hast, blockId, blockType);
};

/**
 * hast spells `data-*` and `aria-*` attributes in camelCase
 * (`dataFootnoteRef`, `ariaDescribedBy`). React and the HTML serializer want
 * the DOM attribute names, so map them here once; everything else hast emits
 * (`className`, `align`, `start`, `checked`, …) is already React-compatible.
 */
const normalizeProperties = (properties: Record<string, unknown>): Record<string, unknown> => {
  let normalized: Record<string, unknown> | null = null;

  for (const [name, value] of Object.entries(properties)) {
    let nextName = name;
    let nextValue = value;

    if (/^data[A-Z]/.test(name)) {
      // `dataFootnoteRef` → `data-footnote-ref`: lowercase the first word, then
      // dash-separate the rest.
      const rest = name.slice(4);
      const kebab =
        rest[0].toLowerCase() + rest.slice(1).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      nextName = `data-${kebab}`;
      if (nextValue === true) nextValue = "";
    } else if (/^aria[A-Z]/.test(name)) {
      nextName = `aria-${name.slice(4).toLowerCase()}`;
    }

    if (Array.isArray(nextValue) && nextName !== "className") {
      nextValue = nextValue.join(" ");
    }

    if (nextName !== name || nextValue !== value) {
      if (!normalized) normalized = { ...properties };
      delete normalized[name];
      normalized[nextName] = nextValue;
    }
  }

  return normalized ?? properties;
};

/**
 * Recursively extracts all text content from an AST subtree for measurement.
 * A `<br>` contributes a newline so pretext reserves the extra line.
 */
export const extractText = (node: Readonly<ASTNode>): string => {
  if (node.value) return node.value;
  if (node.tagName === "br") return "\n";
  if (!node.children) return "";
  return node.children.map(extractText).join("");
};
