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

export type TableBorderStyle = "all" | "horizontal" | "none";

export type TablePluginOptions = {
  /** Show the CSV copy button in the table header bar. Default `true`. */
  showCopy?: boolean;
  /**
   * Which cell borders render. `"all"` = full grid, `"horizontal"` =
   * row dividers only (default), `"none"` = no borders.
   */
  borderStyle?: TableBorderStyle;
  /** Alternate row backgrounds via `--inkset-table-zebra-bg`. */
  zebra?: boolean;
  /**
   * Pin the `<thead>` while the table scrolls vertically. Only meaningful
   * when the enclosing container clips height. Default `false`.
   */
  stickyHeader?: boolean;
};

// ── Table component ───────────────────────────────────────────────

function TableBlock({ node }: PluginComponentProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tableHtml = (node.pluginData?.html as string) ?? "";
  const csvData = (node.pluginData?.csv as string) ?? "";
  const showCopy = (node.pluginData?.showCopy as boolean) ?? true;
  const borderStyle = (node.pluginData?.borderStyle as TableBorderStyle) ?? "horizontal";
  const zebra = (node.pluginData?.zebra as boolean) ?? false;
  const stickyHeader = (node.pluginData?.stickyHeader as boolean) ?? false;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(csvData).then(() => {
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
    });
  }, [csvData]);

  // data-* attrs rather than runtime className juggling so the default
  // stylesheet can express each variant as a plain selector and consumers
  // can override without needing to know plugin internals.
  return (
    <div
      className="inkset-table-block"
      data-border-style={borderStyle}
      data-zebra={zebra ? "true" : undefined}
      data-sticky-header={stickyHeader ? "true" : undefined}
      style={{ position: "relative" }}
    >
      {showCopy && (
        <div className="inkset-table-header">
          <button
            onClick={handleCopy}
            className="inkset-table-copy"
            aria-label={copied ? "Copied" : "Copy as CSV"}
          >
            {copied ? "Copied!" : "Copy CSV"}
          </button>
        </div>
      )}
      <div className="inkset-table-scroll">
        <div dangerouslySetInnerHTML={{ __html: tableHtml }} />
      </div>
    </div>
  );
}

// ── Plugin definition ─────────────────────────────────────────────

export const createTablePlugin = (options?: TablePluginOptions): InksetPlugin => {
  const showCopy = options?.showCopy ?? true;
  const borderStyle: TableBorderStyle = options?.borderStyle ?? "horizontal";
  const zebra = options?.zebra ?? false;
  const stickyHeader = options?.stickyHeader ?? false;

  return {
    name: "table",
    handles: ["table"],

    transform(node: ASTNode, _ctx: PluginContext): EnrichedNode {
      const html = nodeToHtml(node);
      const csv = nodeToCSV(node);

      return {
        ...node,
        transformedBy: "table",
        pluginData: { html, csv, showCopy, borderStyle, zebra, stickyHeader },
      };
    },

    measure(node: EnrichedNode, maxWidth: number): Dimensions {
      const html = (node.pluginData?.html as string) ?? "";
      const rowCount = (html.match(/<tr/g) ?? []).length;
      // The header bar only occupies space when showCopy is on.
      const headerHeight = (node.pluginData?.showCopy as boolean) === false
        ? 0
        : TABLE_HEADER_HEIGHT;

      return {
        width: maxWidth,
        height: Math.max(rowCount * TABLE_ROW_HEIGHT + headerHeight, TABLE_MIN_HEIGHT),
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
