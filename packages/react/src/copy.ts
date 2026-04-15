import type { EnrichedNode, PluginRegistry } from "@preframe/core";

export interface CopyHandler {
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
        const codeEl = blockEl.querySelector("pre code, .preframe-code-content code");
        parts.push((codeEl ?? blockEl).textContent ?? "");
        break;
      }

      case "math-display": {
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
        const tableEl = blockEl.querySelector("table");
        if (tableEl) {
          parts.push(tableToText(tableEl));
        } else {
          parts.push(blockEl.textContent ?? "");
        }
        break;
      }

      default: {
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

  const colWidths = rows[0].map((_, colIdx) =>
    Math.max(...rows.map((row) => (row[colIdx] ?? "").length)),
  );

  return rows
    .map((row) =>
      row.map((cell, i) => cell.padEnd(colWidths[i] ?? 0)).join("  "),
    )
    .join("\n");
}
