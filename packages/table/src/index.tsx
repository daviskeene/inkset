import React, { useCallback, useRef, useState } from "react";
import type {
  PreframePlugin,
  ASTNode,
  EnrichedNode,
  PluginContext,
  Dimensions,
  PluginComponentProps,
} from "@preframe/core";

// ── Table component ────────────────────────────────────────────────

function TableBlock({ node }: PluginComponentProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const tableHtml = (node.pluginData?.html as string) ?? "";
  const csvData = (node.pluginData?.csv as string) ?? "";

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(csvData).then(() => {
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }, [csvData]);

  return (
    <div className="preframe-table-block" style={{ position: "relative" }}>
      <div
        className="preframe-table-header"
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "2px 8px",
          fontSize: "11px",
          fontFamily: "system-ui, sans-serif",
          opacity: 0.6,
        }}
      >
        <button
          onClick={handleCopy}
          className="preframe-table-copy"
          aria-label={copied ? "Copied" : "Copy as CSV"}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px 6px",
            fontSize: "11px",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {copied ? "Copied!" : "Copy CSV"}
        </button>
      </div>
      <div
        className="preframe-table-scroll"
        style={{
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div dangerouslySetInnerHTML={{ __html: tableHtml }} />
      </div>
    </div>
  );
}

// ── Plugin definition ──────────────────────────────────────────────

export function createTablePlugin(): PreframePlugin {
  return {
    name: "table",
    handles: ["table"],

    transform(node: ASTNode, ctx: PluginContext): EnrichedNode {
      const html = nodeToHtml(node);
      const csv = nodeToCSV(node);

      return {
        ...node,
        transformedBy: "table",
        pluginData: { html, csv },
      };
    },

    measure(node: EnrichedNode, maxWidth: number): Dimensions {
      // Estimate table height based on row count
      const html = (node.pluginData?.html as string) ?? "";
      const rowCount = (html.match(/<tr/g) ?? []).length;
      const headerHeight = 36;
      const rowHeight = 32;
      const padding = 16;

      return {
        width: maxWidth,
        height: Math.max(rowCount * rowHeight + headerHeight + padding, 60),
      };
    },

    component: TableBlock,
  };
}

// ── HTML + CSV extraction ──────────────────────────────────────────

function nodeToHtml(node: ASTNode): string {
  if (node.type === "text") return escapeHtml(node.value ?? "");
  if (node.type === "root" && node.children) {
    return node.children.map(nodeToHtml).join("");
  }

  const tag = node.tagName ?? "div";
  const attrs = propsToAttrs(node.properties);
  const children = node.children?.map(nodeToHtml).join("") ?? "";

  if (["br", "hr", "img", "input"].includes(tag)) {
    return `<${tag}${attrs} />`;
  }

  return `<${tag}${attrs}>${children}</${tag}>`;
}

function nodeToCSV(node: ASTNode): string {
  const rows = findNodes(node, "tr");
  return rows
    .map((row) => {
      const cells = findNodes(row, "th").concat(findNodes(row, "td"));
      return cells.map((cell) => extractText(cell).replace(/"/g, '""')).map((t) => `"${t}"`).join(",");
    })
    .join("\n");
}

function findNodes(node: ASTNode, tagName: string): ASTNode[] {
  const results: ASTNode[] = [];
  if (node.tagName === tagName) results.push(node);
  if (node.children) {
    for (const child of node.children) {
      results.push(...findNodes(child, tagName));
    }
  }
  return results;
}

function extractText(node: ASTNode): string {
  if (node.value) return node.value;
  if (!node.children) return "";
  return node.children.map(extractText).join("");
}

function propsToAttrs(props?: Record<string, unknown>): string {
  if (!props) return "";
  return Object.entries(props)
    .filter(([, v]) => v != null && v !== false)
    .map(([k, v]) => {
      const attr = k === "className" ? "class" : k;
      if (v === true) return ` ${attr}`;
      return ` ${attr}="${escapeHtml(String(v))}"`;
    })
    .join("");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
