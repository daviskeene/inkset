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

const CODE_LINE_HEIGHT = 21;
const CODE_HEADER_HEIGHT = 24;
const CODE_PADDING = 24;
const CODE_MIN_HEIGHT = 48;
const COPY_FEEDBACK_DURATION_MS = 2000;

// ── Shiki lazy loading ─────────────────────────────────────────────

type ShikiHighlighter = {
  codeToHtml: (code: string, options: { lang: string; theme: string }) => string;
};

let highlighterPromise: Promise<ShikiHighlighter> | null = null;
let highlighterInstance: ShikiHighlighter | null = null;
const loadedThemes = new Set<string>();

const DEFAULT_LANGS = [
  "javascript", "typescript", "python", "rust", "go", "java",
  "c", "cpp", "csharp", "ruby", "php", "swift", "kotlin",
  "html", "css", "json", "yaml", "toml", "markdown",
  "bash", "shell", "sql", "graphql", "dockerfile",
  "tsx", "jsx",
];

// Load shiki once and lazily extend it with any extra themes requested by
// later plugin instances. We don't know all themes up front — callers can
// pass any shiki-supported theme name.
const getHighlighter = async (
  themes: string[],
): Promise<ShikiHighlighter> => {
  const uniqueThemes = [...new Set(themes.filter(Boolean))];

  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const shiki = await import("shiki");
      const instance = await shiki.createHighlighter({
        themes: uniqueThemes.length > 0 ? uniqueThemes : ["github-dark"],
        langs: DEFAULT_LANGS,
      });
      highlighterInstance = instance;
      uniqueThemes.forEach((t) => loadedThemes.add(t));
      return instance;
    })();
  }

  const instance = await highlighterPromise;

  // Lazy-load any theme that wasn't in the initial createHighlighter call.
  const missing = uniqueThemes.filter((t) => !loadedThemes.has(t));
  if (missing.length > 0) {
    const instanceWithLoader = instance as ShikiHighlighter & {
      loadTheme?: (theme: string) => Promise<void>;
    };
    if (typeof instanceWithLoader.loadTheme === "function") {
      await Promise.all(
        missing.map((t) =>
          instanceWithLoader.loadTheme!(t).then(() => loadedThemes.add(t)).catch((err: unknown) => {
            if (process.env.NODE_ENV !== "production") {
              console.debug(`[inkset/code] failed to load theme "${t}":`, err);
            }
          }),
        ),
      );
    }
  }

  return instance;
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

  const code = node.pluginData?.code as string ?? "";
  const lang = node.pluginData?.lang as string ?? "text";
  const theme = (node.pluginData?.theme as string) ?? "github-dark";
  const lightTheme = node.pluginData?.lightTheme as string | undefined;
  const showHeader = (node.pluginData?.showHeader as boolean) ?? true;
  const showCopy = (node.pluginData?.showCopy as boolean) ?? true;
  const showLangLabel = (node.pluginData?.showLangLabel as boolean) ?? true;
  const wrapLongLines = (node.pluginData?.wrapLongLines as boolean) ?? false;

  useEffect(() => {
    let cancelled = false;
    const themes = lightTheme ? [theme, lightTheme] : [theme];

    getHighlighter(themes).then((highlighter) => {
      if (cancelled) return;
      try {
        setHtmlDark(highlighter.codeToHtml(code, { lang, theme }));
        if (lightTheme) {
          setHtmlLight(highlighter.codeToHtml(code, { lang, theme: lightTheme }));
        } else {
          setHtmlLight(null);
        }
      } catch (err: unknown) {
        // Fall through to the raw <pre> below when shiki can't highlight.
        if (process.env.NODE_ENV !== "production") {
          console.debug("[inkset/code] Highlight failed, falling back to plain text:", err);
        }
        setHtmlDark(null);
        setHtmlLight(null);
      }
    });

    return () => { cancelled = true; };
  }, [code, lang, theme, lightTheme]);

  useLayoutEffect(() => {
    if (isStreaming) return;
    if (htmlDark === null && htmlLight === null) return;
    onContentSettled?.();
  }, [htmlDark, htmlLight, isStreaming, onContentSettled]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
    });
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

  return {
    name: "code",
    // Any option that affects the rendered HTML must participate in the
    // plugin identity so swapping instances (e.g. dark → light shiki theme)
    // invalidates transform caches and re-highlights existing blocks.
    key: [theme, lightTheme ?? "", showHeader, showCopy, showLangLabel, wrapLongLines].join("|"),
    handles: ["code"],

    async preload(): Promise<void> {
      const themes = lightTheme ? [theme, lightTheme] : [theme];
      await getHighlighter(themes);
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
        },
      };
    },

    measure(node: EnrichedNode, maxWidth: number): Dimensions {
      const code = (node.pluginData?.code as string) ?? "";
      const lines = code.split("\n");
      const headerSpace = (node.pluginData?.showHeader as boolean) === false
        ? 0
        : CODE_HEADER_HEIGHT;

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
