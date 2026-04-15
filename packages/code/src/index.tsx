import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  extractText,
  type PreframePlugin,
  type ASTNode,
  type EnrichedNode,
  type PluginContext,
  type Dimensions,
  type PluginComponentProps,
} from "@preframe/core";

// ── Shiki lazy loading ─────────────────────────────────────────────

interface ShikiHighlighter {
  codeToHtml: (code: string, options: { lang: string; theme: string }) => string;
}

let highlighterPromise: Promise<ShikiHighlighter> | null = null;
let highlighterInstance: ShikiHighlighter | null = null;

async function getHighlighter(theme: string = "github-dark"): Promise<ShikiHighlighter> {
  if (highlighterInstance) return highlighterInstance;
  if (highlighterPromise) return highlighterPromise;

  highlighterPromise = (async () => {
    const shiki = await import("shiki");
    const instance = await shiki.createHighlighter({
      themes: [theme, "github-light"],
      langs: [
        "javascript", "typescript", "python", "rust", "go", "java",
        "c", "cpp", "csharp", "ruby", "php", "swift", "kotlin",
        "html", "css", "json", "yaml", "toml", "markdown",
        "bash", "shell", "sql", "graphql", "dockerfile",
        "tsx", "jsx",
      ],
    });
    highlighterInstance = instance;
    return instance;
  })();

  return highlighterPromise;
}

// ── Code block component ───────────────────────────────────────────

export interface CodeBlockProps extends PluginComponentProps {
  theme?: string;
}

function CodeBlock({ node, isStreaming }: PluginComponentProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const code = node.pluginData?.code as string ?? "";
  const lang = node.pluginData?.lang as string ?? "text";
  const theme = (node.pluginData?.theme as string) ?? "github-dark";

  // Highlight with Shiki (async, progressive enhancement)
  useEffect(() => {
    let cancelled = false;

    getHighlighter(theme).then((highlighter) => {
      if (cancelled) return;
      try {
        const result = highlighter.codeToHtml(code, { lang, theme });
        setHtml(result);
      } catch {
        // Language not loaded — show plain text
        setHtml(null);
      }
    });

    return () => { cancelled = true; };
  }, [code, lang, theme]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div className="preframe-code-block" style={{ position: "relative" }}>
      {/* Header bar with language label and copy button */}
      <div
        className="preframe-code-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "4px 12px",
          fontSize: "12px",
          fontFamily: "system-ui, sans-serif",
          opacity: 0.7,
        }}
      >
        <span className="preframe-code-lang">{lang}</span>
        <button
          onClick={handleCopy}
          className="preframe-code-copy"
          aria-label={copied ? "Copied" : "Copy code"}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px 6px",
            fontSize: "12px",
            fontFamily: "system-ui, sans-serif",
            opacity: 0.8,
          }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {/* Code content — highlighted HTML or plain text fallback */}
      {html ? (
        <div
          className="preframe-code-content"
          dangerouslySetInnerHTML={{ __html: html }}
          style={{ overflow: "auto" }}
        />
      ) : (
        <pre
          className="preframe-code-content"
          style={{
            margin: 0,
            padding: "12px",
            overflow: "auto",
            fontFamily: "ui-monospace, monospace",
            fontSize: "14px",
            lineHeight: "1.5",
          }}
        >
          <code>{code}</code>
        </pre>
      )}

      {/* Streaming indicator */}
      {isStreaming && (
        <div
          className="preframe-code-streaming"
          style={{
            position: "absolute",
            bottom: 4,
            right: 8,
            fontSize: "10px",
            opacity: 0.5,
          }}
        >
          ...
        </div>
      )}
    </div>
  );
}

// ── Plugin definition ──────────────────────────────────────────────

export interface CodePluginOptions {
  /** Shiki theme name. Default: "github-dark" */
  theme?: string;
  /** Additional languages to load */
  langs?: string[];
}

export function createCodePlugin(options?: CodePluginOptions): PreframePlugin {
  const theme = options?.theme ?? "github-dark";

  return {
    name: "code",
    handles: ["code"],

    transform(node: ASTNode, ctx: PluginContext): EnrichedNode {
      // Extract code content and language from the parsed node
      const code = extractCodeContent(node);
      const lang = node.lang ?? detectLanguage(node) ?? "text";

      return {
        ...node,
        transformedBy: "code",
        pluginData: {
          code,
          lang,
          theme,
        },
      };
    },

    measure(node: EnrichedNode, maxWidth: number): Dimensions {
      const code = (node.pluginData?.code as string) ?? "";
      const lines = code.split("\n");
      const lineHeight = 21; // 14px font * 1.5 line-height
      const headerHeight = 28; // language label + copy button
      const padding = 24; // top + bottom padding

      const height = lines.length * lineHeight + headerHeight + padding;

      return {
        width: maxWidth,
        height: Math.max(height, 48), // minimum height
      };
    },

    component: CodeBlock,
  };
}

// ── Helpers ────────────────────────────────────────────────────────

function extractCodeContent(node: ASTNode): string {
  // For code blocks, the content is in the first text child of the <code> element
  if (node.children) {
    for (const child of node.children) {
      if (child.tagName === "pre") {
        return extractCodeContent(child);
      }
      if (child.tagName === "code") {
        return extractText(child);
      }
      if (child.type === "text" && child.value) {
        return child.value;
      }
    }
  }
  return node.value ?? "";
}

function detectLanguage(node: ASTNode): string | null {
  // Check className on code element (remark adds language-xxx class)
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
}
