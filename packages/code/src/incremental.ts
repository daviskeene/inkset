// Incremental shiki highlighting for streaming code blocks.
//
// A streaming block only ever grows at its end, and TextMate grammars tokenize
// line by line with state carried forward: the grammar state after line k
// fully determines how line k+1 tokenizes. So completed lines are tokenized
// once and their HTML is cached along with the state after them; an update
// only tokenizes the lines completed since, plus the still-growing last line.
// Re-highlighting the whole block instead cost ~45ms per pass at 150 lines.

/** The subset of a shiki highlighter this module needs. */
export type IncrementalHighlighter = {
  codeToHast: (code: string, options: HastOptions) => HastRoot;
  getLastGrammarState: (root: HastRoot) => unknown;
};

/** shiki's `hastToHtml`, injected so tests and callers share one copy. */
export type HastToHtml = (root: HastRoot) => string;

type HastOptions = { lang: string; theme: string; grammarState?: unknown };

type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: string;
};

export type HastRoot = { type: "root"; children: HastNode[] };

export type HighlightedCode = {
  /** `class` of shiki's `<pre>` (e.g. `"shiki github-dark"`). */
  preClassName: string;
  /** Inline `style` of shiki's `<pre>` (background and foreground colors). */
  preStyle: string;
  /** Inner HTML of each `<span class="line">`, one per source line. */
  lines: string[];
};

export type HighlightCache = {
  lang: string;
  theme: string;
  /** Source of the cached lines, each terminated by `\n`. */
  source: string;
  lines: string[];
  /** Grammar state after the last cached line. */
  state: unknown;
  preClassName: string;
  preStyle: string;
};

export const createHighlightCache = (): HighlightCache => ({
  lang: "",
  theme: "",
  source: "",
  lines: [],
  state: undefined,
  preClassName: "",
  preStyle: "",
});

const resetCache = (cache: HighlightCache, lang: string, theme: string): void => {
  cache.lang = lang;
  cache.theme = theme;
  cache.source = "";
  cache.lines = [];
  cache.state = undefined;
};

const findElement = (nodes: HastNode[] | undefined, tagName: string): HastNode | undefined =>
  nodes?.find((node) => node.type === "element" && node.tagName === tagName);

/**
 * Highlights `code` with the same output `codeToHtml` would produce, reusing
 * whatever `cache` already holds for a prefix of it. Throws whatever shiki
 * throws (an unloaded language or theme); the cache is reset on the next call
 * with a different language, theme, or a non-prefix change.
 */
export const highlightIncremental = (
  highlighter: IncrementalHighlighter,
  hastToHtml: HastToHtml,
  code: string,
  lang: string,
  theme: string,
  cache: HighlightCache,
): HighlightedCode => {
  if (cache.lang !== lang || cache.theme !== theme || !code.startsWith(cache.source)) {
    resetCache(cache, lang, theme);
  }

  const tokenize = (text: string): { lines: string[]; state: unknown } => {
    const root = highlighter.codeToHast(text, { lang, theme, grammarState: cache.state });
    const pre = findElement(root.children, "pre");
    const codeElement = findElement(pre?.children, "code");
    cache.preClassName = String(pre?.properties?.class ?? "");
    cache.preStyle = String(pre?.properties?.style ?? "");
    const lines: string[] = [];
    for (const child of codeElement?.children ?? []) {
      if (child.type !== "element") continue;
      lines.push(hastToHtml({ type: "root", children: child.children ?? [] }));
    }
    return { lines, state: highlighter.getLastGrammarState(root) };
  };

  // Lines that end in `\n` can no longer change; only the tail after the last
  // newline is still being written.
  const lastNewline = code.lastIndexOf("\n");
  const completed = code.slice(0, lastNewline + 1);
  if (completed.length > cache.source.length) {
    // Drop the final `\n`: it terminates the last new line, it doesn't start
    // another one.
    const added = tokenize(completed.slice(cache.source.length, -1));
    cache.lines.push(...added.lines);
    cache.state = added.state;
    cache.source = completed;
  }

  const tail = tokenize(code.slice(lastNewline + 1)).lines;
  return {
    preClassName: cache.preClassName,
    preStyle: cache.preStyle,
    lines: [...cache.lines, ...tail],
  };
};
