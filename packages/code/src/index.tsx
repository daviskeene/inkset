// Code block plugin: syntax highlighting via shiki with streaming support.
declare const process: { env: { NODE_ENV?: string } };

import React, {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  extractText,
  type InksetPlugin,
  type ASTNode,
  type EnrichedNode,
  type PluginContext,
  type Dimensions,
  type PluginComponentProps,
} from "@inkset/core";
import {
  createHighlightCache,
  highlightIncremental,
  type HastToHtml,
  type HighlightCache,
  type HighlightedCode,
  type IncrementalHighlighter,
} from "./incremental";

// `process` only exists for bundled consumers; an unbundled ESM import must
// not throw a ReferenceError from inside a catch block.
const isDev = typeof process !== "undefined" && process.env?.NODE_ENV !== "production";

const CODE_LINE_HEIGHT = 21;
// Header bar: 4px padding + 20px button (12px font, 16px line, 2px padding) + 4px + 1px border.
const CODE_HEADER_HEIGHT = 29;
const CODE_PADDING = 24;
const CODE_MIN_HEIGHT = 48;
const COPY_FEEDBACK_DURATION_MS = 2000;
const FALLBACK_THEME = "github-dark";
const PLAIN_LANG = "text";
// Languages shiki renders as plain text without loading a grammar.
const PLAIN_LANGS = new Set(["", "text", "txt", "plain", "plaintext"]);

// ── Shiki lazy loading ─────────────────────────────────────────────

type ShikiHighlighter = IncrementalHighlighter & {
  loadTheme?: (theme: string) => Promise<void>;
  loadLanguage?: (lang: string) => Promise<void>;
};

type ShikiModule = {
  createHighlighter: (options: { themes: string[]; langs: string[] }) => Promise<unknown>;
  hastToHtml?: HastToHtml;
  bundledLanguages?: Record<string, unknown>;
};

let highlighterPromise: Promise<ShikiHighlighter> | null = null;
// Set once shiki resolves, so blocks can highlight synchronously while they
// render instead of a frame later.
let readyHighlighter: ShikiHighlighter | null = null;
let hastToHtml: HastToHtml | null = null;
let bundledLanguages: Record<string, unknown> | null = null;
const loadedThemes = new Set<string>();
const loadedLangs = new Set<string>();
// Themes/languages shiki rejected. Remembered so a typo is logged once and
// never retried on every highlight, and so a bad theme degrades to the
// fallback theme instead of taking the whole highlighter down.
const failedThemes = new Set<string>();
const failedLangs = new Set<string>();

/** Whether shiki has a grammar to load for `lang` (an id or an alias). */
const isLoadableLang = (lang: string): boolean =>
  !PLAIN_LANGS.has(lang) && (bundledLanguages === null || lang in bundledLanguages);

/** Whether `lang` needs no more loading: loaded, failed, or plain text. */
const isLangSettled = (lang: string): boolean =>
  !isLoadableLang(lang) || loadedLangs.has(lang) || failedLangs.has(lang);

const isThemeSettled = (theme: string): boolean =>
  loadedThemes.has(theme) || failedThemes.has(theme);

// Load shiki once and lazily extend it with the themes and languages blocks
// ask for. Callers can pass any shiki-supported theme or language name.
const getHighlighter = async (
  themes: string[],
  langs: string[] = [],
): Promise<ShikiHighlighter> => {
  const uniqueThemes = [...new Set(themes.filter(Boolean))].filter((t) => !failedThemes.has(t));

  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const shiki = (await import("shiki")) as unknown as ShikiModule;
      // Only the fallback theme goes into `createHighlighter`: one bad theme
      // in that list rejects the whole highlighter. Requested themes load one
      // at a time below, so a typo'd light theme costs exactly that theme —
      // and the theme every failure degrades to is always loaded. No
      // grammars either: each language loads the first time a block uses
      // it, where a fixed default list fetched ~2.4 MB of grammars before
      // the first block could highlight.
      const instance = (await shiki.createHighlighter({
        themes: [FALLBACK_THEME],
        langs: [],
      })) as ShikiHighlighter;
      loadedThemes.add(FALLBACK_THEME);
      hastToHtml = shiki.hastToHtml ?? null;
      bundledLanguages = shiki.bundledLanguages ?? null;
      readyHighlighter = instance;
      return instance;
    })().catch((err: unknown) => {
      // A rejected promise must not stay cached: every later highlight would
      // rethrow it and no code on the page would ever be highlighted again.
      highlighterPromise = null;
      if (isDev) console.warn("[inkset/code] shiki failed to initialize:", err);
      throw err;
    });
  }

  const instance = await highlighterPromise;

  const missingThemes = uniqueThemes.filter((t) => !loadedThemes.has(t));
  const missingLangs = [...new Set(langs)].filter((l) => !isLangSettled(l));
  await Promise.all([
    ...missingThemes.map((t) =>
      typeof instance.loadTheme === "function"
        ? instance.loadTheme(t).then(
            () => loadedThemes.add(t),
            (err: unknown) => {
              failedThemes.add(t);
              if (isDev) console.warn(`[inkset/code] failed to load theme "${t}":`, err);
            },
          )
        : Promise.resolve(),
    ),
    ...missingLangs.map((l) =>
      typeof instance.loadLanguage === "function"
        ? instance.loadLanguage(l).then(
            () => loadedLangs.add(l),
            (err: unknown) => {
              failedLangs.add(l);
              if (isDev) console.warn(`[inkset/code] failed to load language "${l}":`, err);
            },
          )
        : Promise.resolve(),
    ),
  ]);

  return instance;
};

const resolveTheme = (theme: string): string =>
  failedThemes.has(theme) || !loadedThemes.has(theme) ? FALLBACK_THEME : theme;

/**
 * Highlights through the block's incremental cache, falling back to plain
 * text when the grammar isn't available. Null when shiki can't render the
 * block at all, in which case the raw source shows instead.
 */
const highlightBlock = (
  code: string,
  lang: string,
  theme: string,
  cache: HighlightCache,
): HighlightedCode | null => {
  if (!readyHighlighter || !hastToHtml) return null;
  const resolvedTheme = resolveTheme(theme);
  const useLang = loadedLangs.has(lang) && !failedLangs.has(lang) ? lang : PLAIN_LANG;
  try {
    return highlightIncremental(readyHighlighter, hastToHtml, code, useLang, resolvedTheme, cache);
  } catch (err) {
    if (useLang !== PLAIN_LANG) {
      failedLangs.add(lang);
      if (isDev)
        console.warn(`[inkset/code] language "${lang}" unavailable; rendering as text`, err);
      return highlightBlock(code, PLAIN_LANG, theme, cache);
    }
    if (isDev) console.debug("[inkset/code] Highlight failed, falling back to plain text:", err);
    return null;
  }
};

const parseInlineStyle = (style: string): React.CSSProperties => {
  const out: Record<string, string> = {};
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon === -1) continue;
    const property = declaration.slice(0, colon).trim();
    if (!property) continue;
    const key = property.startsWith("--")
      ? property
      : property.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
    out[key] = declaration.slice(colon + 1).trim();
  }
  return out;
};

/**
 * shiki's `<pre><code>` markup with one element per line. While a block
 * streams, completed lines keep their DOM nodes (and any text selected in
 * them); only the growing last line updates.
 */
const HighlightedLines = ({
  className,
  result,
}: {
  className: string;
  result: HighlightedCode;
}) => (
  <div className={className}>
    <pre className={result.preClassName} style={parseInlineStyle(result.preStyle)} tabIndex={0}>
      <code>
        {result.lines.map((html, index) => (
          <Fragment key={index}>
            {index > 0 && "\n"}
            <span className="line" dangerouslySetInnerHTML={{ __html: html }} />
          </Fragment>
        ))}
      </code>
    </pre>
  </div>
);

// ── Code block component ──────────────────────────────────────────

export interface CodeBlockProps extends PluginComponentProps {
  theme?: string;
}

const CodeBlock = ({ node, isStreaming, onContentSettled }: PluginComponentProps) => {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Re-render once shiki, or a theme or grammar this block needs, has loaded.
  const [, onLoaded] = useReducer((count: number) => count + 1, 0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [darkCache] = useState(createHighlightCache);
  const [lightCache] = useState(createHighlightCache);

  const code = (node.pluginData?.code as string) ?? "";
  const lang = (node.pluginData?.lang as string) ?? "text";
  const theme = (node.pluginData?.theme as string) ?? "github-dark";
  const lightTheme = node.pluginData?.lightTheme as string | undefined;
  const showHeader = (node.pluginData?.showHeader as boolean) ?? true;
  const showCopy = (node.pluginData?.showCopy as boolean) ?? true;
  const showLangLabel = (node.pluginData?.showLangLabel as boolean) ?? true;
  const wrapLongLines = (node.pluginData?.wrapLongLines as boolean) ?? false;
  const extraLangs = (node.pluginData?.langs as string[] | undefined) ?? [];

  const themes = lightTheme ? [theme, lightTheme] : [theme];
  const ready = readyHighlighter !== null && themes.every(isThemeSettled) && isLangSettled(lang);
  // Until the first line of code arrives, a streaming fence's info string may
  // still be a prefix of the real language ("c" on the way to "cpp"); don't
  // fetch a grammar for it.
  const langPending = isStreaming && code === "";

  useEffect(() => {
    if (ready || langPending) return;
    let cancelled = false;
    getHighlighter(themes, [lang, ...extraLangs]).then(
      () => {
        if (!cancelled) onLoaded();
      },
      (err: unknown) => {
        // Fall through to the raw <pre> below when shiki can't load — and
        // still settle the block's height, which would otherwise stay
        // provisional forever.
        if (cancelled) return;
        if (isDev)
          console.debug("[inkset/code] Highlight failed, falling back to plain text:", err);
        setLoadFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, langPending, lang, theme, lightTheme, extraLangs.join(",")]);

  // Highlighting runs in render: incremental tokenization costs a line or two
  // per update, so there is no throttle and no frame of stale output.
  const dark = ready ? highlightBlock(code, lang, theme, darkCache) : null;
  const light = ready && lightTheme ? highlightBlock(code, lang, lightTheme, lightCache) : null;

  useLayoutEffect(() => {
    if (isStreaming) return;
    if (!ready && !loadFailed) return;
    onContentSettled?.();
  }, [ready, loadFailed, isStreaming, code, lang, theme, lightTheme, onContentSettled]);

  const handleCopy = useCallback(() => {
    // Insecure contexts have no clipboard API; a denied permission rejects.
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
      })
      .catch(() => setCopied(false));
  }, [code]);

  const hasHeader = showHeader && (showLangLabel || showCopy);

  return (
    <div
      className="inkset-code-block"
      data-wrap={wrapLongLines ? "true" : undefined}
      data-has-light={light ? "true" : undefined}
      style={{ position: "relative" }}
    >
      {hasHeader && (
        <div className="inkset-code-header">
          {showLangLabel ? <span className="inkset-code-lang">{lang}</span> : <span />}
          {showCopy && (
            <button
              onClick={handleCopy}
              className="inkset-code-copy"
              aria-label={copied ? "Copied" : "Copy code"}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          )}
        </div>
      )}

      {dark ? (
        <HighlightedLines className="inkset-code-content inkset-code-dark" result={dark} />
      ) : (
        <pre className="inkset-code-content">
          <code>{code}</code>
        </pre>
      )}

      {light && (
        <HighlightedLines className="inkset-code-content inkset-code-light" result={light} />
      )}

      {isStreaming && <div className="inkset-code-streaming">...</div>}
    </div>
  );
};

// ── Plugin definition ─────────────────────────────────────────────

export type CodePluginOptions = {
  /** Primary (dark-mode) shiki theme. Default `"github-dark"`. */
  theme?: string;
  /**
   * Optional companion theme shown under `@media (prefers-color-scheme: light)`.
   * Both themes' highlighted HTML is rendered; CSS toggles visibility.
   */
  lightTheme?: string;
  /**
   * Grammars to load during `preload()`, so their first block highlights
   * without waiting for a fetch. Every other language shiki bundles loads the
   * first time a block uses it; names shiki doesn't know render as plain text.
   */
  langs?: string[];
  /** Show the language label + copy button bar above the code. Default `true`. */
  showHeader?: boolean;
  /** Show the copy button inside the header bar. Default `true`. */
  showCopy?: boolean;
  /** Show the language badge on the left of the header. Default `true`. */
  showLangLabel?: boolean;
  /** Wrap long lines instead of horizontal-scrolling. Default `false`. */
  wrapLongLines?: boolean;
};

export const createCodePlugin = (options?: CodePluginOptions): InksetPlugin => {
  const theme = options?.theme ?? "github-dark";
  const lightTheme = options?.lightTheme;
  const showHeader = options?.showHeader ?? true;
  const showCopy = options?.showCopy ?? true;
  const showLangLabel = options?.showLangLabel ?? true;
  const wrapLongLines = options?.wrapLongLines ?? false;
  const langs = options?.langs ?? [];

  return {
    name: "code",
    // Any option that affects the rendered HTML must participate in the
    // plugin identity so swapping instances (e.g. dark → light shiki theme)
    // invalidates transform caches and re-highlights existing blocks.
    key: [
      theme,
      lightTheme ?? "",
      showHeader,
      showCopy,
      showLangLabel,
      wrapLongLines,
      langs.join(","),
    ].join("|"),
    handles: ["code"],

    async preload(): Promise<void> {
      const themes = lightTheme ? [theme, lightTheme] : [theme];
      await getHighlighter(themes, langs);
    },

    transform(node: ASTNode, _ctx: PluginContext): EnrichedNode {
      const code = extractCodeContent(node);
      const lang = node.lang ?? detectLanguage(node) ?? "text";

      return {
        ...node,
        transformedBy: "code",
        pluginData: {
          code,
          lang,
          theme,
          lightTheme,
          showHeader,
          showCopy,
          showLangLabel,
          wrapLongLines,
          langs,
        },
      };
    },

    measure(node: EnrichedNode, maxWidth: number): Dimensions {
      const code = (node.pluginData?.code as string) ?? "";
      // remark keeps the fence's trailing newline; it does not render a line.
      const lines = code.replace(/\n$/, "").split("\n");
      // Same predicate as the component: the bar only exists when there is
      // something to put in it.
      const hasHeader =
        (node.pluginData?.showHeader as boolean) !== false &&
        ((node.pluginData?.showLangLabel as boolean) !== false ||
          (node.pluginData?.showCopy as boolean) !== false);
      const headerSpace = hasHeader ? CODE_HEADER_HEIGHT : 0;

      return {
        width: maxWidth,
        height: Math.max(
          lines.length * CODE_LINE_HEIGHT + headerSpace + CODE_PADDING,
          CODE_MIN_HEIGHT,
        ),
      };
    },

    component: CodeBlock,
  };
};

// ── Helpers ───────────────────────────────────────────────────────

const extractCodeContent = (node: ASTNode): string => {
  if (node.children) {
    for (const child of node.children) {
      if (child.tagName === "pre") return extractCodeContent(child);
      if (child.tagName === "code") return extractText(child);
      if (child.type === "text" && child.value) return child.value;
    }
  }
  return node.value ?? "";
};

/** Detect language from remark's `language-xxx` className on code elements. */
const detectLanguage = (node: ASTNode): string | null => {
  if (node.children) {
    for (const child of node.children) {
      if (child.tagName === "pre" && child.children) {
        for (const grandchild of child.children) {
          if (grandchild.tagName === "code" && grandchild.properties?.className) {
            const classes = grandchild.properties.className;
            if (Array.isArray(classes)) {
              const langClass = classes.find(
                (c) => typeof c === "string" && c.startsWith("language-"),
              );
              if (typeof langClass === "string") return langClass.replace("language-", "");
            }
          }
        }
      }
    }
  }
  return null;
};
