// Code block plugin: syntax highlighting via shiki with streaming support.
import React, { useEffect, useRef, useState, useCallback } from "react";
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

const getHighlighter = async (theme: string = "github-dark"): Promise<ShikiHighlighter> => {
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
};

// ── Code block component ──────────────────────────────────────────

export interface CodeBlockProps extends PluginComponentProps {
  theme?: string;
}

function CodeBlock({ node, isStreaming }: PluginComponentProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const code = node.pluginData?.code as string ?? "";
  const lang = node.pluginData?.lang as string ?? "text";
  const theme = (node.pluginData?.theme as string) ?? "github-dark";

  useEffect(() => {
    let cancelled = false;

    getHighlighter(theme).then((highlighter) => {
      if (cancelled) return;
      try {
        const result = highlighter.codeToHtml(code, { lang, theme });
        setHtml(result);
      } catch (err: unknown) {
        // Gracefully degrade to plain text when shiki can't highlight the language
        if (process.env.NODE_ENV !== "production") {
          console.debug("[inkset/code] Highlight failed, falling back to plain text:", err);
        }
        setHtml(null);
      }
    });

    return () => { cancelled = true; };
  }, [code, lang, theme]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
    });
  }, [code]);

  return (
    <div className="inkset-code-block" style={{ position: "relative" }}>
      <div
        className="inkset-code-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "4px 12px",
          fontSize: "12px",
          lineHeight: "16px",
          fontFamily: "system-ui, sans-serif",
          opacity: 0.7,
        }}
      >
        <span className="inkset-code-lang">{lang}</span>
        <button
          onClick={handleCopy}
          className="inkset-code-copy"
          aria-label={copied ? "Copied" : "Copy code"}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px 6px",
            fontSize: "12px",
            lineHeight: "16px",
            fontFamily: "system-ui, sans-serif",
            opacity: 0.8,
          }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {html ? (
        <div
          className="inkset-code-content"
          dangerouslySetInnerHTML={{ __html: html }}
          style={{ overflow: "auto" }}
        />
      ) : (
        <pre
          className="inkset-code-content"
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

      {isStreaming && (
        <div
          className="inkset-code-streaming"
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

// ── Plugin definition ─────────────────────────────────────────────

export type CodePluginOptions = {
  theme?: string;
  langs?: string[];
};

export const createCodePlugin = (options?: CodePluginOptions): InksetPlugin => {
  const theme = options?.theme ?? "github-dark";

  return {
    name: "code",
    handles: ["code"],

    transform(node: ASTNode, _ctx: PluginContext): EnrichedNode {
      const code = extractCodeContent(node);
      const lang = node.lang ?? detectLanguage(node) ?? "text";

      return {
        ...node,
        transformedBy: "code",
        pluginData: { code, lang, theme },
      };
    },

    measure(node: EnrichedNode, maxWidth: number): Dimensions {
      const code = (node.pluginData?.code as string) ?? "";
      const lines = code.split("\n");

      return {
        width: maxWidth,
        height: Math.max(lines.length * CODE_LINE_HEIGHT + CODE_HEADER_HEIGHT + CODE_PADDING, CODE_MIN_HEIGHT),
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
