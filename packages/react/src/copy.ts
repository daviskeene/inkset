import type { EnrichedNode, PluginRegistry } from "@preframe/core";

/**
 * Smart Content-Aware Copy
 *
 * When users select and copy content from a preframe container,
 * this module intercepts the copy event and formats the clipboard
 * based on what's being copied:
 *
 * - Code blocks → raw source code (not highlighted HTML)
 * - Math expressions → LaTeX source
 * - Regular text → clean text without markdown artifacts
 * - Mixed selection → structured plain text
 */

export interface CopyHandler {
  /** Attach copy handler to a container element */
  attach(container: HTMLElement): () => void;
}

export function createCopyHandler(registry: PluginRegistry): CopyHandler {
  return {
    attach(container: HTMLElement) {
      const handler = (e: ClipboardEvent) => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return;

        const range = selection.getRangeAt(0);
        if (!container.contains(range.commonAncestorContainer)) return;

        // Walk through selected blocks and extract content-aware text
        const text = extractSmartText(container, range);
        if (text !== null) {
          e.preventDefault();
          e.clipboardData?.setData("text/plain", text);
        }
      };

      container.addEventListener("copy", handler);
      return () => container.removeEventListener("copy", handler);
    },
  };
}

function extractSmartText(
  container: HTMLElement,
  range: Range,
): string | null {
  const parts: string[] = [];
  const blocks = container.querySelectorAll("[data-block-id]");

  for (const block of blocks) {
    if (!range.intersectsNode(block)) continue;

    const blockType = block.getAttribute("data-block-type");
    const blockEl = block as HTMLElement;

    switch (blockType) {
      case "code": {
        // Extract raw source code from data attribute or code element
        const codeEl = blockEl.querySelector("pre code, .preframe-code-content code");
        if (codeEl) {
          parts.push(codeEl.textContent ?? "");
        } else {
          parts.push(blockEl.textContent ?? "");
        }
        break;
      }

      case "math-display": {
        // Extract LaTeX source from data attribute
        const mathEl = blockEl.querySelector("[data-latex]");
        if (mathEl) {
          const latex = mathEl.getAttribute("data-latex") ?? "";
          parts.push(`$$${latex}$$`);
        } else {
          parts.push(blockEl.textContent ?? "");
        }
        break;
      }

      case "table": {
        // Use CSV format for tables
        const tableEl = blockEl.querySelector("table");
        if (tableEl) {
          parts.push(tableToText(tableEl));
        } else {
          parts.push(blockEl.textContent ?? "");
        }
        break;
      }

      default: {
        // Regular text — clean extraction
        parts.push(blockEl.textContent ?? "");
        break;
      }
    }
  }

  if (parts.length === 0) return null;
  return parts.join("\n\n");
}

function tableToText(table: HTMLTableElement): string {
  const rows: string[][] = [];
  const trs = table.querySelectorAll("tr");

  for (const tr of trs) {
    const cells: string[] = [];
    const tds = tr.querySelectorAll("th, td");
    for (const td of tds) {
      cells.push((td.textContent ?? "").trim());
    }
    rows.push(cells);
  }

  if (rows.length === 0) return "";

  // Calculate column widths for aligned output
  const colWidths = rows[0].map((_, colIdx) =>
    Math.max(...rows.map((row) => (row[colIdx] ?? "").length)),
  );

  return rows
    .map((row) =>
      row.map((cell, i) => cell.padEnd(colWidths[i] ?? 0)).join("  "),
    )
    .join("\n");
}
