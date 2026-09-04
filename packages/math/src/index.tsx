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

// `process` only exists for bundled consumers; an unbundled ESM import must
// not throw a ReferenceError from inside a catch block.
const isDev = typeof process !== "undefined" && process.env?.NODE_ENV !== "production";

const MATH_LINE_HEIGHT = 44;
const MATH_PADDING = 16;
// KaTeX's stylesheet gives `.katex-display` a `1em 0` margin (at its 1.21em
// font size) that the block's `overflow: auto` keeps inside the block.
const MATH_DISPLAY_MARGINS = 2 * 16 * 1.21;
const MATH_MIN_HEIGHT = 60;

/** Renders math with a custom `MathRenderer` supplied to `createMathPlugin`. */
type CustomRender = (latex: string, options: MathRenderOptions) => string;

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

/**
 * @deprecated Placeholder only: no MathJax integration ships yet, so
 * equations rendered with this renderer show their LaTeX source. Pass your
 * own `MathRenderer` (any `renderToString(latex, { displayMode })` that
 * returns HTML) to use MathJax or another engine.
 */
export const createMathJaxRenderer = (): MathRenderer => {
  return {
    name: "mathjax",
    renderToString(_latex: string, _options: MathRenderOptions): string {
      return "";
    },
  };
};

// ── Math block component ──────────────────────────────────────────

const MathBlock = ({ node, isStreaming = false, onContentSettled }: PluginComponentProps) => {
  const [html, setHtml] = useState<string>("");
  const [error, setError] = useState<string>("");

  const latex = (node.pluginData?.latex as string) ?? "";
  const displayMode = (node.pluginData?.displayMode as boolean) ?? true;
  const rendererName = (node.pluginData?.renderer as string) ?? "katex";
  const customRender = node.pluginData?.render as CustomRender | undefined;
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

    if (customRender) {
      try {
        setHtml(customRender(latex, { displayMode, throwOnError: true }));
        setError("");
      } catch (err) {
        setHtml("");
        setError(err instanceof Error ? err.message : "Render error");
      }
    } else if (rendererName === "katex") {
      loadKatex()
        .then((katex) => {
          if (cancelled) return;
          try {
            // `throwOnError: true` is what makes `errorDisplay` reachable:
            // with it off, KaTeX swallows parse errors into its own red
            // `.katex-error` span and the option never applied.
            const result = katex.default.renderToString(latex, {
              displayMode,
              throwOnError: true,
              trust: false,
              strict: false,
              output: "htmlAndMathml",
            });
            setHtml(result);
            setError("");
          } catch (err) {
            setHtml("");
            setError(err instanceof Error ? err.message : "Parse error");
          }
        })
        .catch((loadErr: unknown) => {
          if (cancelled) return;
          if (isDev) console.debug("[inkset/math] KaTeX import failed:", loadErr);
          setHtml("");
          setError("KaTeX not available");
        });
    }

    return () => {
      cancelled = true;
    };
  }, [customRender, displayMode, isStreaming, latex, rendererName]);

  useLayoutEffect(() => {
    if (isStreaming) return;
    if (!html && !error) return;
    onContentSettled?.();
  }, [error, html, isStreaming, onContentSettled]);

  const Tag = displayMode ? "div" : "span";

  const errorContent = errorDisplay === "message" ? error : errorDisplay === "hide" ? null : latex;

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

let warnedMathJaxStub = false;

export const createMathPlugin = (options?: MathPluginOptions): InksetPlugin => {
  const renderer = options?.renderer ?? createKaTeXRenderer();
  const displayAlign: MathDisplayAlign = options?.displayAlign ?? "center";
  const errorDisplay: MathErrorDisplay = options?.errorDisplay ?? "source";
  // Only KaTeX is built in. Any other renderer is invoked through its own
  // `renderToString`; the MathJax export is a stub that returns "" and would
  // silently show LaTeX source for every equation.
  const customRender: CustomRender | undefined =
    renderer.name === "katex" ? undefined : (latex, opts) => renderer.renderToString(latex, opts);
  if (renderer.name === "mathjax" && !warnedMathJaxStub && isDev) {
    warnedMathJaxStub = true;
    console.warn(
      "[inkset/math] createMathJaxRenderer() is a placeholder with no MathJax integration; equations will show their LaTeX source. Pass a custom MathRenderer instead.",
    );
  }

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
      let latex = raw.trim();

      // Bare \begin{env}...\end{env} blocks arrive without $$ wrapping; only
      // strip fences when they're actually present.
      if (latex.startsWith("$$")) {
        latex = latex
          .replace(/^\$\$\s*/, "")
          .replace(/\s*\$\$$/, "")
          .trim();
      }

      // KaTeX has no \label / \eqref support and errors on them. Strip so
      // the surrounding equation still renders; cross-reference linking
      // across blocks is out of scope here.
      latex = latex.replace(/\\label\{[^}]*\}/g, "");
      latex = latex.replace(/\\eqref\{[^}]*\}/g, "(?)");

      return {
        ...node,
        transformedBy: "math",
        pluginData: {
          latex,
          displayMode: true,
          renderer: renderer.name,
          render: customRender,
          displayAlign,
          errorDisplay,
        },
      };
    },

    measure(node: EnrichedNode, maxWidth: number): Dimensions {
      const latex = (node.pluginData?.latex as string) ?? "";
      const hasMultiline = latex.includes("\\\\") || latex.includes("\\begin");
      const baseParts = Math.max(1, latex.split("\\\\").length);

      // Over-estimating is the safe direction: the settled KaTeX render
      // reports its real height and the layout shrinks to it.
      const height =
        (hasMultiline ? baseParts * MATH_LINE_HEIGHT : MATH_LINE_HEIGHT) +
        MATH_PADDING +
        MATH_DISPLAY_MARGINS;

      return { width: maxWidth, height: Math.ceil(Math.max(height, MATH_MIN_HEIGHT)) };
    },

    component: MathBlock,
  };

  return plugin;
};
