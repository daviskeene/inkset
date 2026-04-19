import type { BlockSpacing, BuiltinBlockKind, EnrichedNode } from "./types";

const DEFAULT_BLOCK_GAP = 16;

export const DEFAULT_BLOCK_SPACING: BlockSpacing = {
  default: DEFAULT_BLOCK_GAP,
};

const matchesKind = (
  expected: BuiltinBlockKind | BuiltinBlockKind[],
  actual: BuiltinBlockKind,
): boolean => {
  return Array.isArray(expected) ? expected.includes(actual) : expected === actual;
};

const getEdgeSpacing = (
  spacing: BlockSpacing | undefined,
  kind: BuiltinBlockKind,
  edge: "top" | "bottom",
): number => {
  return spacing?.blocks?.[kind]?.[edge] ?? 0;
};

const getHeadingKind = (node: EnrichedNode): BuiltinBlockKind => {
  const tag = node.tagName ?? node.children?.[0]?.tagName ?? "";
  const match = /^h([1-6])$/i.exec(tag);
  const level = match ? Number.parseInt(match[1], 10) : 1;
  return `heading${Math.max(1, Math.min(6, level))}` as BuiltinBlockKind;
};

export const getNodeBlockKind = (node: EnrichedNode): BuiltinBlockKind => {
  switch (node.blockType) {
    case "paragraph":
      return "paragraph";
    case "heading":
      return getHeadingKind(node);
    case "blockquote":
      return "blockquote";
    case "list": {
      const tag = node.tagName ?? node.children?.[0]?.tagName ?? "";
      if (tag === "ol") return "ordered-list";
      if (tag === "ul") return "unordered-list";
      return "unknown";
    }
    case "code":
      return "code";
    case "table":
      return "table";
    case "math-display":
      return "math";
    case "thematic-break":
      return "hr";
    case "html":
      return "html";
    default:
      return "unknown";
  }
};

export const resolveBlockGap = (
  previousKind: BuiltinBlockKind,
  nextKind: BuiltinBlockKind,
  spacing?: BlockSpacing,
): number => {
  if (spacing?.pairs) {
    for (const rule of spacing.pairs) {
      if (matchesKind(rule.from, previousKind) && matchesKind(rule.to, nextKind)) {
        return Math.max(0, rule.gap);
      }
    }
  }

  const base = spacing?.default ?? DEFAULT_BLOCK_GAP;
  const previousBottom = getEdgeSpacing(spacing, previousKind, "bottom");
  const nextTop = getEdgeSpacing(spacing, nextKind, "top");
  return Math.max(0, base + previousBottom + nextTop);
};
