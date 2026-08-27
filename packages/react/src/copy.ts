// Smart copy handler: extracts source-friendly text from code, math, and table blocks.
import type { PluginRegistry } from "@inkset/core";

export type CopyHandler = {
  attach(container: HTMLElement): () => void;
};

export const createCopyHandler = (_registry: PluginRegistry): CopyHandler => {
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
};

/** The selection clipped to one block, or null when it only touches it. */
const clipRangeToBlock = (range: Range, blockEl: HTMLElement): Range | null => {
  const blockRange = document.createRange();
  blockRange.selectNodeContents(blockEl);
  if (
    range.compareBoundaryPoints(Range.END_TO_START, blockRange) >= 0 ||
    range.compareBoundaryPoints(Range.START_TO_END, blockRange) <= 0
  ) {
    return null;
  }
  if (blockEl.contains(range.startContainer)) {
    blockRange.setStart(range.startContainer, range.startOffset);
  }
  if (blockEl.contains(range.endContainer)) {
    blockRange.setEnd(range.endContainer, range.endOffset);
  }
  return blockRange.collapsed ? null : blockRange;
};

/** Whether the selection spans the block from its first to its last character. */
const coversBlock = (range: Range, blockEl: HTMLElement): boolean => {
  const blockRange = document.createRange();
  blockRange.selectNodeContents(blockEl);
  return (
    range.compareBoundaryPoints(Range.START_TO_START, blockRange) <= 0 &&
    range.compareBoundaryPoints(Range.END_TO_END, blockRange) >= 0
  );
};

const extractSmartText = (container: HTMLElement, range: Range): string | null => {
  const parts: string[] = [];
  const blocks = container.querySelectorAll("[data-block-id]");

  for (const block of blocks) {
    const blockEl = block as HTMLElement;
    const clipped = clipRangeToBlock(range, blockEl);
    if (!clipped) continue;

    // Source-friendly extraction (the code text, the LaTeX, the aligned
    // table) only when the whole block is selected. A partial selection
    // copies exactly what is highlighted — never lines the user did not pick.
    const blockType = coversBlock(range, blockEl) ? block.getAttribute("data-block-type") : null;

    switch (blockType) {
      case "code": {
        const codeEl = blockEl.querySelector("pre code, .inkset-code-content code");
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
        parts.push(clipped.toString());
        break;
      }
    }
  }

  if (parts.length === 0) return null;
  return parts.join("\n\n");
};

const tableToText = (table: HTMLTableElement): string => {
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
    .map((row) => row.map((cell, i) => cell.padEnd(colWidths[i] ?? 0)).join("  "))
    .join("\n");
};
