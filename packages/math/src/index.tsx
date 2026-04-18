// Math block plugin: LaTeX rendering via KaTeX or MathJax with streaming fallback.
declare const process: { env: { NODE_ENV?: string } };

import React, { useEffect, useLayoutEffect, useState } from "react";
import {
  extractText,
  type InksetPlugin,
  type ASTNode,
  type EnrichedNode,
  type PluginContext,
  type Dimensions,
  type PluginComponentProps,
} from "@inkset/core";

const MATH_LINE_HEIGHT = 44;
const MATH_PADDING = 16;
const MATH_MIN_HEIGHT = 60;

// Lazy, singleton-cached dynamic imports so both `preload()` and the block
// component converge on the same promise.
let katexPromise: Promise<typeof import("katex")> | null = null;
const loadKatex = (): Promise<typeof import("katex")> => {
  if (!katexPromise) katexPromise = import("katex");
  return katexPromise;
};

// ── Math renderer abstraction ─────────────────────────────────────

export type MathRenderer = {
  renderToString(latex: string, options: MathRenderOptions): string;
  name: string;
};

export type MathRenderOptions = {
  displayMode: boolean;
  throwOnError?: boolean;
};

// ── Built-in renderers ────────────────────────────────────────────

/** SSR stub -- actual rendering happens client-side in the MathBlock component via dynamic import */
export const createKaTeXRenderer = (): MathRenderer => {
  return {
    name: "katex",
    renderToString(_latex: string, _options: MathRenderOptions): string {
      return "";
    },
  };
};

/** SSR stub -- actual rendering happens client-side in the MathBlock component */
export const createMathJaxRenderer = (): MathRenderer => {
  return {
    name: "mathjax",
    renderToString(_latex: string, _options: MathRenderOptions): string {
      return "";
    },
  };
};

// ── Math block component ──────────────────────────────────────────

const MathBlock = ({
  node,
  isStreaming = false,
  onContentSettled,
}: PluginComponentProps) => {
  const [html, setHtml] = useState<string>("");
  const [error, setError] = useState<string>("");

  const latex = (node.pluginData?.latex as string) ?? "";
  const displayMode = (node.pluginData?.displayMode as boolean) ?? true;
  const rendererName = (node.pluginData?.renderer as string) ?? "katex";
  const displayAlign = (node.pluginData?.displayAlign as MathDisplayAlign) ?? "center";
  const errorDisplay = (node.pluginData?.errorDisplay as MathErrorDisplay) ?? "source";

  // Render math client-side with dynamic import
  useEffect(() => {
    if (!latex) return;

    if (isStreaming) {
      setHtml("");
      setError("");
      return;
    }

    let cancelled = false;

    if (rendererName === "katex") {
      loadKatex().then((katex) => {
        if (cancelled) return;
        try {
          const result = katex.default.renderToString(latex, {
            displayMode,
            throwOnError: false,
            trust: false,
            strict: false,
            output: "htmlAndMathml",
          });
          setHtml(result);
          setError("");
        } catch (err) {
          setHtml("");
          if (isStreaming) {
            setError("");
          } else {
            setError(err instanceof Error ? err.message : "Parse error");
          }
        }
      }).catch((loadErr: unknown) => {
        if (cancelled) return;
        if (process.env.NODE_ENV !== "production") {
          console.debug("[inkset/math] KaTeX import failed:", loadErr);
        }
        setHtml("");
        if (isStreaming) {
          setError("");
        } else {
          setError("KaTeX not available");
        }
      });
    }

    return () => { cancelled = true; };
  }, [displayMode, isStreaming, latex, rendererName]);

  useLayoutEffect(() => {
    if (isStreaming) return;
    if (!html && !error) return;
    onContentSettled?.();
  }, [error, html, isStreaming, onContentSettled]);

  const Tag = displayMode ? "div" : "span";

  const errorContent = errorDisplay === "message"
    ? error
    : errorDisplay === "hide"
      ? null
      : latex;

  return (
    <Tag
      className={`inkset-math ${displayMode ? "inkset-math-display" : "inkset-math-inline"}`}
      data-latex={latex}
      data-display-align={displayMode ? displayAlign : undefined}
      aria-label={`Math: ${latex}`}
    >
      {html ? (
        <span dangerouslySetInnerHTML={{ __html: html }} />
      ) : error && !isStreaming && errorContent !== null ? (
        <span className="inkset-math-error" title={error}>
          {errorContent}
        </span>
      ) : (
        <span className="inkset-math-raw">{latex}</span>
      )}
    </Tag>
  );
};

// ── Plugin definition ─────────────────────────────────────────────

export type MathDisplayAlign = "left" | "center" | "right";
export type MathErrorDisplay = "source" | "message" | "hide";

export type MathPluginOptions = {
  renderer?: MathRenderer;
  singleDollarInline?: boolean;
  throwOnError?: boolean;
  /**
   * Horizontal alignment for display-mode equations. Default `"center"`.
   * Emitted as a `data-display-align` attr so the default stylesheet can
   * translate it to `text-align` without JS.
   */
  displayAlign?: MathDisplayAlign;
  /**
   * How to render a parse error. `"source"` (default) shows the raw LaTeX,
   * `"message"` shows the KaTeX error text inline, `"hide"` renders nothing.
   */
  errorDisplay?: MathErrorDisplay;
};

export const createMathPlugin = (options?: MathPluginOptions): InksetPlugin => {
  const renderer = options?.renderer ?? createKaTeXRenderer();
  const displayAlign: MathDisplayAlign = options?.displayAlign ?? "center";
  const errorDisplay: MathErrorDisplay = options?.errorDisplay ?? "source";

  const plugin: InksetPlugin & { rendererName: string } = {
    name: "math",
    key: [renderer.name, displayAlign, errorDisplay].join("|"),
    handles: ["math-display"],
    rendererName: renderer.name,

    async preload(): Promise<void> {
      if (renderer.name === "katex") {
        await loadKatex();
      }
    },

    transform(node: ASTNode, _ctx: PluginContext): EnrichedNode {
      const raw = extractText(node);
      const latex = raw.replace(/^\$\$\s*/, "").replace(/\s*\$\$$/, "").trim();

      return {
        ...node,
        transformedBy: "math",
        pluginData: {
          latex,
          displayMode: true,
          renderer: renderer.name,
          displayAlign,
          errorDisplay,
        },
      };
    },

    measure(node: EnrichedNode, maxWidth: number): Dimensions {
      const latex = (node.pluginData?.latex as string) ?? "";
      const hasMultiline = latex.includes("\\\\") || latex.includes("\\begin");
      const baseParts = Math.max(1, latex.split("\\\\").length);

      const height = hasMultiline
        ? baseParts * MATH_LINE_HEIGHT + MATH_PADDING
        : MATH_LINE_HEIGHT + MATH_PADDING;

      return { width: maxWidth, height: Math.max(height, MATH_MIN_HEIGHT) };
    },

    component: MathBlock,
  };

  return plugin;
};
