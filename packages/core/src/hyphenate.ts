// Hyphenation layer: inserts soft hyphens (U+00AD) into word-like text runs so
// Pretext and the browser can break long words on syllable boundaries.
//
// Uses Bram Stein's Hypher with the standard en-us pattern set. Both libraries
// ship CJS without type declarations; the sibling `hyphenate-modules.d.ts`
// supplies those, and the triple-slash reference below guarantees it's loaded
// even when a downstream tsconfig (e.g. the Next.js playground) would otherwise
// skip sibling declaration files.
/// <reference path="./hyphenate-modules.d.ts" />
import type { ASTNode, BlockType, EnrichedNode } from "./types";

type HypherInstance = {
  hyphenate(word: string): string[];
  hyphenateText(text: string, minLength?: number): string;
};

type HyphenPatterns = {
  id: string[];
  leftmin: number;
  rightmin: number;
  patterns: Record<string, string>;
  exceptions?: string;
};

type HypherConstructor = new (patterns: HyphenPatterns) => HypherInstance;

export type Hyphenator = (text: string) => string;

export type SupportedLanguage = "en-us";

const DEFAULT_LANG: SupportedLanguage = "en-us";

let cached: Map<SupportedLanguage, Promise<Hyphenator>> | null = null;

/**
 * Loads a hyphenator for the given language. Instances are cached per process
 * because Hypher's trie construction is non-trivial and patterns are immutable.
 */
export const loadHyphenator = (lang: SupportedLanguage = DEFAULT_LANG): Promise<Hyphenator> => {
  if (!cached) cached = new Map();

  const existing = cached.get(lang);
  if (existing) return existing;

  const promise = buildHyphenator(lang);
  cached.set(lang, promise);
  return promise;
};

const buildHyphenator = async (lang: SupportedLanguage): Promise<Hyphenator> => {
  const [HypherModule, patternsModule] = await Promise.all([
    import("hypher"),
    loadPatterns(lang),
  ]);

  // Hypher ships CJS: in an ESM context the constructor lands on .default.
  const Hypher = (HypherModule.default ?? HypherModule) as unknown as HypherConstructor;
  const patterns = (patternsModule.default ?? patternsModule) as HyphenPatterns;
  const instance = new Hypher(patterns);

  return (text: string) => instance.hyphenateText(text);
};

const loadPatterns = async (lang: SupportedLanguage): Promise<{ default?: HyphenPatterns } & HyphenPatterns> => {
  if (lang === "en-us") {
    return (await import("hyphenation.en-us")) as unknown as { default?: HyphenPatterns } & HyphenPatterns;
  }
  throw new Error(`[inkset] unsupported hyphenation language: ${lang}`);
};

// ── Tree walker ────────────────────────────────────────────────────

/**
 * Returns a copy of `node` with soft hyphens inserted into text descendants.
 * Skips block types where hyphenation would damage rendering (code, math, tables).
 */
export const hyphenateBlock = (
  node: EnrichedNode,
  hyphenator: Hyphenator,
): EnrichedNode => {
  if (!shouldHyphenateBlock(node.blockType)) return node;
  return hyphenateNode(node, hyphenator) as EnrichedNode;
};

const shouldHyphenateBlock = (blockType: BlockType): boolean => {
  switch (blockType) {
    case "code":
    case "math-display":
    case "table":
    case "html":
    case "thematic-break":
      return false;
    default:
      return true;
  }
};

const hyphenateNode = (node: ASTNode, hyphenator: Hyphenator): ASTNode => {
  if (node.type === "text" && typeof node.value === "string") {
    return { ...node, value: hyphenator(node.value) };
  }

  // Leave code/math spans alone even inside prose blocks.
  if (node.tagName === "code" || node.tagName === "pre") return node;

  if (!node.children || node.children.length === 0) return node;

  const nextChildren: ASTNode[] = new Array(node.children.length);
  let mutated = false;
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const next = hyphenateNode(child, hyphenator);
    if (next !== child) mutated = true;
    nextChildren[i] = next;
  }

  return mutated ? { ...node, children: nextChildren } : node;
};
