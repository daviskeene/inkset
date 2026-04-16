// Table plugin: renders markdown tables with horizontal scroll and CSV copy support.
import React, { useCallback, useRef, useState } from "react";
import {
  extractText,
  nodeToHtml,
  type InksetPlugin,
  type ASTNode,
  type EnrichedNode,
  type PluginContext,
  type Dimensions,
  type PluginComponentProps,
} from "@inkset/core";

const TABLE_HEADER_HEIGHT = 20;
const TABLE_ROW_HEIGHT = 44;
const TABLE_MIN_HEIGHT = 64;
const COPY_FEEDBACK_DURATION_MS = 2000;

// ── Table component ───────────────────────────────────────────────

function TableBlock({ node }: PluginComponentProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tableHtml = (node.pluginData?.html as string) ?? "";
  const csvData = (node.pluginData?.csv as string) ?? "";

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(csvData).then(() => {
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
    });
  }, [csvData]);

  return (
    <div className="inkset-table-block" style={{ position: "relative" }}>
      <div className="inkset-table-header">
        <button
          onClick={handleCopy}
          className="inkset-table-copy"
          aria-label={copied ? "Copied" : "Copy as CSV"}
        >
          {copied ? "Copied!" : "Copy CSV"}
        </button>
      </div>
      <div className="inkset-table-scroll">
        <div dangerouslySetInnerHTML={{ __html: tableHtml }} />
      </div>
    </div>
  );
}

// ── Plugin definition ─────────────────────────────────────────────

export const createTablePlugin = (): InksetPlugin => {
  return {
    name: "table",
    handles: ["table"],

    transform(node: ASTNode, _ctx: PluginContext): EnrichedNode {
      const html = nodeToHtml(node);
      const csv = nodeToCSV(node);

      return {
        ...node,
        transformedBy: "table",
        pluginData: { html, csv },
      };
    },

    measure(node: EnrichedNode, maxWidth: number): Dimensions {
      const html = (node.pluginData?.html as string) ?? "";
      const rowCount = (html.match(/<tr/g) ?? []).length;

      return {
        width: maxWidth,
        height: Math.max(rowCount * TABLE_ROW_HEIGHT + TABLE_HEADER_HEIGHT, TABLE_MIN_HEIGHT),
      };
    },

    component: TableBlock,
  };
};

// ── CSV extraction ────────────────────────────────────────────────

const nodeToCSV = (node: ASTNode): string => {
  const rows = findNodes(node, "tr");
  return rows
    .map((row) => {
      const cells = findNodes(row, "th").concat(findNodes(row, "td"));
      return cells.map((cell) => extractText(cell).replace(/"/g, '""')).map((t) => `"${t}"`).join(",");
    })
    .join("\n");
};

const findNodes = (node: ASTNode, tagName: string): ASTNode[] => {
  const results: ASTNode[] = [];
  if (node.tagName === tagName) results.push(node);
  if (node.children) {
    for (const child of node.children) {
      results.push(...findNodes(child, tagName));
    }
  }
  return results;
};
