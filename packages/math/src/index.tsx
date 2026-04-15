import React, { useEffect, useState } from "react";
import {
  extractText,
  escapeHtml,
  type PreframePlugin,
  type ASTNode,
  type EnrichedNode,
  type PluginContext,
  type Dimensions,
  type PluginComponentProps,
} from "@preframe/core";

// ── Math renderer abstraction ─────────────────────────────────────

export interface MathRenderer {
  renderToString(latex: string, options: MathRenderOptions): string;
  name: string;
}

export interface MathRenderOptions {
  displayMode: boolean;
  throwOnError?: boolean;
}

// ── Built-in renderers ────────────────────────────────────────────

/** KaTeX renderer — renders client-side via dynamic import */
export function createKaTeXRenderer(): MathRenderer {
  // katex loaded lazily at render time, not at plugin creation time
  return {
    name: "katex",
    renderToString(latex: string, options: MathRenderOptions): string {
      // This is a fallback for SSR or when called synchronously.
      // The real rendering happens in the MathBlock component.
      return "";
    },
  };
}

/** MathJax renderer — broader LaTeX support */
export function createMathJaxRenderer(): MathRenderer {
  return {
    name: "mathjax",
    renderToString(latex: string, options: MathRenderOptions): string {
      return "";
    },
  };
}

// ── Math block component ──────────────────────────────────────────

function MathBlock({ node, isStreaming = false }: PluginComponentProps) {
  const [html, setHtml] = useState<string>("");
  const [error, setError] = useState<string>("");

  const latex = (node.pluginData?.latex as string) ?? "";
  const displayMode = (node.pluginData?.displayMode as boolean) ?? true;
  const rendererName = (node.pluginData?.renderer as string) ?? "katex";

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
      import("katex").then((katex) => {
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
      }).catch(() => {
        if (cancelled) return;
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

  const style: React.CSSProperties = displayMode
    ? { textAlign: "center", padding: "8px 0", overflow: "auto", lineHeight: 1.2 }
    : { display: "inline" };
  const Tag = displayMode ? "div" : "span";

  return (
    <Tag
      className={`preframe-math ${displayMode ? "preframe-math-display" : "preframe-math-inline"}`}
      style={style}
      data-latex={latex}
      aria-label={`Math: ${latex}`}
    >
      {html ? (
        <span dangerouslySetInnerHTML={{ __html: html }} />
      ) : error && !isStreaming ? (
        <span className="preframe-math-error" title={error} style={{ color: "#f87171", fontFamily: "ui-monospace, monospace", fontSize: "13px", lineHeight: 1.4 }}>
          {latex}
        </span>
      ) : (
        <span className="preframe-math-raw" style={{ fontFamily: "ui-monospace, monospace", fontSize: "14px", lineHeight: 1.4, opacity: 0.6 }}>
          {latex}
        </span>
      )}
    </Tag>
  );
}

// ── Plugin definition ─────────────────────────────────────────────

export interface MathPluginOptions {
  renderer?: MathRenderer;
  singleDollarInline?: boolean;
  throwOnError?: boolean;
}

export function createMathPlugin(options?: MathPluginOptions): PreframePlugin {
  const renderer = options?.renderer ?? createKaTeXRenderer();

  const plugin: PreframePlugin & { rendererName: string } = {
    name: "math",
    handles: ["math-display"],
    rendererName: renderer.name,

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
        },
      };
    },

    measure(_node: EnrichedNode, maxWidth: number): Dimensions {
      const latex = (_node.pluginData?.latex as string) ?? "";
      const hasMultiline = latex.includes("\\\\") || latex.includes("\\begin");
      const baseParts = Math.max(1, latex.split("\\\\").length);
      const lineHeight = 44;
      const padding = 16;

      const height = hasMultiline
        ? baseParts * lineHeight + padding
        : lineHeight + padding;

      return { width: maxWidth, height: Math.max(height, 60) };
    },

    component: MathBlock,
  };

  return plugin;
}
