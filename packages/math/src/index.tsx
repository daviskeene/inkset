import React, { useEffect, useRef, useState, useMemo } from "react";
import type {
  PreframePlugin,
  ASTNode,
  EnrichedNode,
  PluginContext,
  Dimensions,
  PluginComponentProps,
} from "@preframe/core";

// ── Math renderer abstraction ──────────────────────────────────────

/**
 * Renderer-agnostic interface. Users can provide a KaTeX renderer,
 * a MathJax renderer, or any custom implementation.
 */
export interface MathRenderer {
  /** Render a LaTeX expression to an HTML string */
  renderToString(latex: string, options: MathRenderOptions): string;
  /** Name of the renderer for diagnostics */
  name: string;
}

export interface MathRenderOptions {
  /** Whether this is display mode ($$) or inline ($) */
  displayMode: boolean;
  /** Whether to throw on parse errors. Default: false */
  throwOnError?: boolean;
}

// ── Built-in renderers ─────────────────────────────────────────────

/** KaTeX renderer — fast, synchronous, good defaults */
export function createKaTeXRenderer(): MathRenderer {
  let katex: typeof import("katex") | null = null;

  return {
    name: "katex",
    renderToString(latex: string, options: MathRenderOptions): string {
      if (!katex) {
        try {
          // Dynamic require for katex (loaded synchronously)
          katex = require("katex");
        } catch {
          return `<span class="preframe-math-error" title="KaTeX not installed">${escapeHtml(latex)}</span>`;
        }
      }

      try {
        return katex!.renderToString(latex, {
          displayMode: options.displayMode,
          throwOnError: options.throwOnError ?? false,
          trust: false,
          strict: false,
          output: "htmlAndMathml", // accessibility: MathML for screen readers
        });
      } catch (err) {
        // Render error: show raw LaTeX with error indicator
        const msg = err instanceof Error ? err.message : "Parse error";
        return `<span class="preframe-math-error" title="${escapeHtml(msg)}">${escapeHtml(latex)}</span>`;
      }
    },
  };
}

/** MathJax renderer — broader LaTeX support, async loading */
export function createMathJaxRenderer(): MathRenderer {
  let mathjaxReady = false;
  let renderFn: ((latex: string, display: boolean) => string) | null = null;

  return {
    name: "mathjax",
    renderToString(latex: string, options: MathRenderOptions): string {
      if (!mathjaxReady) {
        // Try to access MathJax global (loaded via CDN or bundled)
        const MathJax = (globalThis as any).MathJax;
        if (MathJax?.tex2svg || MathJax?.tex2chtml) {
          const converter = MathJax.tex2chtml ?? MathJax.tex2svg;
          renderFn = (tex: string, display: boolean) => {
            const node = converter(tex, { display });
            return MathJax.startup.adaptor.outerHTML(node);
          };
          mathjaxReady = true;
        }
      }

      if (!renderFn) {
        return `<span class="preframe-math-pending">${escapeHtml(latex)}</span>`;
      }

      try {
        return renderFn(latex, options.displayMode);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Render error";
        return `<span class="preframe-math-error" title="${escapeHtml(msg)}">${escapeHtml(latex)}</span>`;
      }
    },
  };
}

// ── Math block component ───────────────────────────────────────────

function MathBlock({ node, isStreaming }: PluginComponentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const latex = (node.pluginData?.latex as string) ?? "";
  const displayMode = (node.pluginData?.displayMode as boolean) ?? true;
  const html = (node.pluginData?.html as string) ?? "";
  const isError = (node.pluginData?.isError as boolean) ?? false;

  // For display math, use a centered block
  const style: React.CSSProperties = displayMode
    ? { textAlign: "center", padding: "8px 0", overflow: "auto" }
    : { display: "inline" };

  return (
    <div
      ref={containerRef}
      className={`preframe-math ${displayMode ? "preframe-math-display" : "preframe-math-inline"} ${isError ? "preframe-math-has-error" : ""}`}
      style={style}
      // For copy: data attribute holds the raw LaTeX source
      data-latex={latex}
      aria-label={`Math: ${latex}`}
    >
      {html ? (
        <span dangerouslySetInnerHTML={{ __html: html }} />
      ) : isStreaming ? (
        <span className="preframe-math-skeleton" style={{ opacity: 0.4 }}>
          {displayMode ? "..." : latex}
        </span>
      ) : (
        <span className="preframe-math-raw">{latex}</span>
      )}
    </div>
  );
}

// ── Plugin definition ──────────────────────────────────────────────

export interface MathPluginOptions {
  /**
   * Math renderer to use. Defaults to KaTeX.
   * Pass createMathJaxRenderer() for MathJax, or provide your own.
   */
  renderer?: MathRenderer;
  /**
   * Enable single-dollar inline math ($x$).
   * Off by default to avoid ambiguity with currency ($50).
   */
  singleDollarInline?: boolean;
  /** Whether to throw on LaTeX parse errors. Default: false (render raw text) */
  throwOnError?: boolean;
}

export function createMathPlugin(options?: MathPluginOptions): PreframePlugin {
  const renderer = options?.renderer ?? createKaTeXRenderer();
  const throwOnError = options?.throwOnError ?? false;

  return {
    name: "math",
    handles: ["math-display", "paragraph"], // paragraph for inline math

    transform(node: ASTNode, ctx: PluginContext): EnrichedNode {
      if (node.blockType === "math-display") {
        return transformDisplayMath(node, renderer, throwOnError);
      }

      // For paragraphs, check if there's inline math
      // (This is handled by the ingest layer's delimiter normalization)
      return node as EnrichedNode;
    },

    measure(node: EnrichedNode, maxWidth: number): Dimensions {
      if (node.blockType !== "math-display") {
        // Inline math — don't override paragraph measurement
        return { width: maxWidth, height: 0 };
      }

      const latex = (node.pluginData?.latex as string) ?? "";
      // Estimate height based on LaTeX complexity
      const hasMultiline = latex.includes("\\\\") || latex.includes("\\begin");
      const baseParts = latex.split("\\\\").length;
      const lineHeight = 32; // display math line height
      const padding = 16;

      const height = hasMultiline
        ? baseParts * lineHeight + padding
        : lineHeight + padding;

      return {
        width: maxWidth,
        height: Math.max(height, 48),
      };
    },

    component: MathBlock,
  };
}

// ── Transform helpers ──────────────────────────────────────────────

function transformDisplayMath(
  node: ASTNode,
  renderer: MathRenderer,
  throwOnError: boolean,
): EnrichedNode {
  const raw = extractText(node);
  // Strip $$ delimiters if present
  const latex = raw.replace(/^\$\$\s*/, "").replace(/\s*\$\$$/, "").trim();

  let html = "";
  let isError = false;

  if (latex) {
    html = renderer.renderToString(latex, { displayMode: true, throwOnError });
    isError = html.includes("preframe-math-error");
  }

  return {
    ...node,
    transformedBy: "math",
    pluginData: {
      latex,
      displayMode: true,
      html,
      isError,
      renderer: renderer.name,
    },
  };
}

function extractText(node: ASTNode): string {
  if (node.value) return node.value;
  if (!node.children) return "";
  return node.children.map(extractText).join("");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
