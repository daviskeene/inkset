// Code block plugin: syntax highlighting via shiki with streaming support.
declare const process: { env: { NODE_ENV?: string } };

import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import {
  extractText,
  type InksetPlugin,
  type ASTNode,
  type EnrichedNode,
  type PluginContext,
  type Dimensions,
  type PluginComponentProps,
} from "@inkset/core";

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
// While a code block streams, re-highlighting the whole block on every token
// is the heaviest per-frame work in the pipeline. Throttle to this interval
// (leading + trailing, so the latest code always gets highlighted) and let
// the settled render highlight immediately.
const STREAMING_HIGHLIGHT_THROTTLE_MS = 120;

// ── Shiki lazy loading ─────────────────────────────────────────────

type ShikiHighlighter = {
  codeToHtml: (code: string, options: { lang: string; theme: string }) => string;
  loadTheme?: (theme: string) => Promise<void>;
  loadLanguage?: (lang: string) => Promise<void>;
  getLoadedLanguages?: () => string[];
};

let highlighterPromise: Promise<ShikiHighlighter> | null = null;
const loadedThemes = new Set<string>();
const loadedLangs = new Set<string>();
// Themes/languages shiki rejected. Remembered so a typo is logged once and
// never retried on every highlight, and so a bad theme degrades to the
// fallback theme instead of taking the whole highlighter down.
const failedThemes = new Set<string>();
const failedLangs = new Set<string>();

const DEFAULT_LANGS = [
  "javascript",
  "typescript",
  "python",
  "rust",
  "go",
  "java",
  "c",
  "cpp",
  "csharp",
  "ruby",
  "php",
  "swift",
  "kotlin",
  "html",
  "css",
  "json",
  "yaml",
  "toml",
  "markdown",
  "bash",
  "shell",
  "sql",
  "graphql",
  "dockerfile",
  "tsx",
  "jsx",
];

// Load shiki once and lazily extend it with any extra themes or languages
// requested by later plugin instances. We don't know all of them up front —
// callers can pass any shiki-supported theme or language name.
const getHighlighter = async (
  themes: string[],
  langs: string[] = [],
): Promise<ShikiHighlighter> => {
  const uniqueThemes = [...new Set(themes.filter(Boolean))].filter((t) => !failedThemes.has(t));
  const uniqueLangs = [...new Set(langs.filter(Boolean))].filter((l) => !failedLangs.has(l));

  if (!highlighterPromise) {
    const initialThemes = uniqueThemes.length > 0 ? uniqueThemes : [FALLBACK_THEME];
    highlighterPromise = (async () => {
      const shiki = await import("shiki");
      const instance = (await shiki.createHighlighter({
        themes: initialThemes,
        langs: DEFAULT_LANGS,
      })) as ShikiHighlighter;
      initialThemes.forEach((t) => loadedThemes.add(t));
      DEFAULT_LANGS.forEach((l) => loadedLangs.add(l));
      return instance;
    })().catch((err: unknown) => {
      // A rejected promise must not stay cached: every later highlight would
      // rethrow it and no code on the page would ever be highlighted again.
      // Blame the requested themes (the usual cause) and let the next call
      // start over with the fallback theme.
      highlighterPromise = null;
      initialThemes.forEach((t) => failedThemes.add(t));
      if (isDev) console.warn("[inkset/code] shiki failed to initialize:", err);
      throw err;
    });
  }

  const instance = await highlighterPromise;

  // Lazy-load anything that wasn't in the initial createHighlighter call.
  const missingThemes = uniqueThemes.filter((t) => !loadedThemes.has(t));
  const missingLangs = uniqueLangs.filter((l) => !loadedLangs.has(l));
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
 * Highlights with the requested language, falling back to plain text when
 * the grammar isn't available (shiki throws for languages it hasn't loaded).
 */
const highlightSafe = (
  highlighter: ShikiHighlighter,
  code: string,
  lang: string,
  theme: string,
): string => {
  const resolvedTheme = resolveTheme(theme);
  const useLang = loadedLangs.has(lang) && !failedLangs.has(lang) ? lang : PLAIN_LANG;
  try {
    return highlighter.codeToHtml(code, { lang: useLang, theme: resolvedTheme });
  } catch (err) {
    if (useLang === PLAIN_LANG) throw err;
    failedLangs.add(lang);
    if (isDev) console.warn(`[inkset/code] language "${lang}" unavailable; rendering as text`, err);
    return highlighter.codeToHtml(code, { lang: PLAIN_LANG, theme: resolvedTheme });
  }
};

// ── Code block component ──────────────────────────────────────────

export interface CodeBlockProps extends PluginComponentProps {
  theme?: string;
}

const CodeBlock = ({ node, isStreaming, onContentSettled }: PluginComponentProps) => {
  const [htmlDark, setHtmlDark] = useState<string | null>(null);
  const [htmlLight, setHtmlLight] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const code = (node.pluginData?.code as string) ?? "";
  const lang = (node.pluginData?.lang as string) ?? "text";
  const theme = (node.pluginData?.theme as string) ?? "github-dark";
  const lightTheme = node.pluginData?.lightTheme as string | undefined;
  const showHeader = (node.pluginData?.showHeader as boolean) ?? true;
  const showCopy = (node.pluginData?.showCopy as boolean) ?? true;
  const showLangLabel = (node.pluginData?.showLangLabel as boolean) ?? true;
  const wrapLongLines = (node.pluginData?.wrapLongLines as boolean) ?? false;
  const extraLangs = (node.pluginData?.langs as string[] | undefined) ?? [];

  const lastHighlightAtRef = useRef(0);
  const [highlightFailed, setHighlightFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const themes = lightTheme ? [theme, lightTheme] : [theme];

    const highlight = () => {
      lastHighlightAtRef.current = Date.now();
      getHighlighter(themes, [lang, ...extraLangs])
        .then((highlighter) => {
          if (cancelled) return;
          // Render both variants before touching state so a failing light
          // theme cannot wipe a dark render that already succeeded.
          const dark = highlightSafe(highlighter, code, lang, theme);
          const light = lightTheme ? highlightSafe(highlighter, code, lang, lightTheme) : null;
          setHtmlDark(dark);
          setHtmlLight(light);
          setHighlightFailed(false);
        })
        .catch((err: unknown) => {
          // Fall through to the raw <pre> below when shiki can't highlight —
          // and still settle the block's height, which used to stay
          // provisional forever on this path.
          if (cancelled) return;
          if (isDev)
            console.debug("[inkset/code] Highlight failed, falling back to plain text:", err);
          setHtmlDark(null);
          setHtmlLight(null);
          setHighlightFailed(true);
        });
    };

    const sinceLast = Date.now() - lastHighlightAtRef.current;
    if (!isStreaming || sinceLast >= STREAMING_HIGHLIGHT_THROTTLE_MS) {
      highlight();
    } else {
      timer = setTimeout(highlight, STREAMING_HIGHLIGHT_THROTTLE_MS - sinceLast);
    }

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, lang, theme, lightTheme, isStreaming, extraLangs.join(",")]);

  useLayoutEffect(() => {
    if (isStreaming) return;
    if (htmlDark === null && htmlLight === null && !highlightFailed) return;
    onContentSettled?.();
  }, [htmlDark, htmlLight, highlightFailed, isStreaming, onContentSettled]);

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
      data-has-light={lightTheme ? "true" : undefined}
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

      {htmlDark ? (
        <div
          className="inkset-code-content inkset-code-dark"
          dangerouslySetInnerHTML={{ __html: htmlDark }}
        />
      ) : (
        <pre className="inkset-code-content">
          <code>{code}</code>
        </pre>
      )}

      {htmlLight && (
        <div
          className="inkset-code-content inkset-code-light"
          dangerouslySetInnerHTML={{ __html: htmlLight }}
        />
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
   * Extra shiki grammars to load on top of the built-in set (JavaScript,
   * TypeScript, Python, Rust, Go, …). Any fence language that has no loaded
   * grammar renders as plain text.
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
