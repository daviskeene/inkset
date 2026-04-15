import type { StreamEvent } from "./types.js";

/**
 * Ingest layer: accumulates streaming tokens, detects block boundaries,
 * and repairs incomplete markdown syntax before parsing.
 *
 * The repair approach follows Streamdown's remend pattern: fix at the
 * string level BEFORE parsing, not after.
 */
export class Ingest {
  private document = "";
  private closed = false;
  private lastBlockCount = 0;

  /** Append a streaming token and return events describing what changed */
  append(token: string): StreamEvent[] {
    if (this.closed) return [];
    if (!token) return [];

    this.document += token;
    return this.detectChanges();
  }

  /** Mark the stream as ended. Runs final repair. */
  end(): StreamEvent[] {
    if (this.closed) return [];
    this.closed = true;

    const events = this.detectChanges();
    // Complete the last block
    if (this.lastBlockCount > 0) {
      events.push({ type: "block:complete", blockId: this.lastBlockCount - 1 });
    }
    events.push({ type: "stream:end" });
    return events;
  }

  /** Get the full accumulated document with syntax repair applied */
  getRepaired(): string {
    return repair(this.document);
  }

  /** Get the raw unrepaired document */
  getRaw(): string {
    return this.document;
  }

  /** Check if the stream is still active */
  get isStreaming(): boolean {
    return !this.closed;
  }

  /** Reset state */
  reset(): void {
    this.document = "";
    this.closed = false;
    this.lastBlockCount = 0;
  }

  private detectChanges(): StreamEvent[] {
    const events: StreamEvent[] = [];
    const blocks = splitBlocks(this.document);
    const newCount = blocks.length;

    if (newCount > this.lastBlockCount) {
      // New blocks appeared — previous block completed, new one started
      for (let i = this.lastBlockCount; i < newCount; i++) {
        if (i > 0) {
          events.push({ type: "block:complete", blockId: i - 1 });
        }
        events.push({ type: "block:new", blockId: i });
      }
    } else if (newCount === this.lastBlockCount && newCount > 0) {
      // Same block count — last block updated
      events.push({ type: "block:update", blockId: newCount - 1 });
    }

    this.lastBlockCount = newCount;
    return events;
  }
}

// ── Block splitting ────────────────────────────────────────────────

/**
 * Split a markdown document into block-level chunks.
 * Uses blank-line detection with awareness of code fences and math blocks.
 */
export function splitBlocks(document: string): string[] {
  if (!document) return [];

  const lines = document.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let inCodeFence = false;
  let inMathBlock = false;
  let fenceChar = "";

  for (const line of lines) {
    const trimmed = line.trimStart();

    // Track code fences
    if (!inMathBlock) {
      const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
      if (fenceMatch) {
        if (!inCodeFence) {
          inCodeFence = true;
          fenceChar = fenceMatch[1][0];
        } else if (trimmed.startsWith(fenceChar.repeat(3)) && trimmed.trim().length <= fenceMatch[1].length + 1) {
          inCodeFence = false;
          fenceChar = "";
        }
      }
    }

    // Track math blocks ($$)
    if (!inCodeFence) {
      if (trimmed.startsWith("$$")) {
        inMathBlock = !inMathBlock;
      }
    }

    // Blank line outside fences/math = block boundary
    if (trimmed === "" && !inCodeFence && !inMathBlock) {
      if (current.length > 0) {
        blocks.push(current.join("\n"));
        current = [];
      }
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    blocks.push(current.join("\n"));
  }

  return blocks;
}

// ── Syntax repair ──────────────────────────────────────────────────

/**
 * Repair incomplete markdown syntax for streaming display.
 * Operates at the string level before parsing.
 *
 * Handles:
 * - Unclosed bold/italic markers
 * - Unclosed inline code
 * - Unclosed code fences
 * - Unclosed math delimiters
 * - Unclosed links
 * - Delimiter normalization (\[ -> $$, \( -> $)
 */
export function repair(text: string): string {
  let result = text;

  // Normalize LaTeX delimiters: \[ -> $$, \( -> $
  result = normalizeDelimiters(result);

  // Auto-close unclosed code fences
  result = repairCodeFences(result);

  // Auto-close unclosed math blocks
  result = repairMathBlocks(result);

  // Auto-close unclosed inline formatting
  result = repairInlineFormatting(result);

  return result;
}

function normalizeDelimiters(text: string): string {
  // Convert \[ ... \] to $$ ... $$
  // Note: $$ in replacement string is special (inserts literal $), so use $$$$
  let result = text.replace(/\\\[/g, "$$$$");
  result = result.replace(/\\\]/g, "$$$$");
  // Convert \( ... \) to $ ... $
  result = result.replace(/\\\(/g, "$$");
  result = result.replace(/\\\)/g, "$$");
  return result;
}

function repairCodeFences(text: string): string {
  const lines = text.split("\n");
  let openFence: string | null = null;

  for (const line of lines) {
    const trimmed = line.trimStart();
    const match = trimmed.match(/^(`{3,}|~{3,})/);
    if (match) {
      if (!openFence) {
        openFence = match[1][0].repeat(match[1].length);
      } else {
        openFence = null;
      }
    }
  }

  if (openFence) {
    return text + "\n" + openFence;
  }
  return text;
}

function repairMathBlocks(text: string): string {
  // Count $$ markers (not inside code fences)
  let count = 0;
  let inCodeFence = false;

  for (const line of text.split("\n")) {
    const trimmed = line.trimStart();
    if (trimmed.match(/^(`{3,}|~{3,})/)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (!inCodeFence && trimmed.includes("$$")) {
      // Count $$ occurrences in this line
      const matches = trimmed.match(/\$\$/g);
      if (matches) count += matches.length;
    }
  }

  if (count % 2 !== 0) {
    return text + "\n$$";
  }
  return text;
}

function repairInlineFormatting(text: string): string {
  let result = text;

  // Only repair in the last line (the streaming edge)
  const lastNewline = result.lastIndexOf("\n");
  const lastLine = lastNewline >= 0 ? result.slice(lastNewline + 1) : result;
  const prefix = lastNewline >= 0 ? result.slice(0, lastNewline + 1) : "";

  let repairedLine = lastLine;

  // Count unclosed bold markers (**)
  const boldMatches = repairedLine.match(/\*\*/g);
  if (boldMatches && boldMatches.length % 2 !== 0) {
    repairedLine += "**";
  }

  // Count unclosed italic markers (single *)
  // Only count * that aren't part of **
  const withoutBold = repairedLine.replace(/\*\*/g, "");
  const italicMatches = withoutBold.match(/\*/g);
  if (italicMatches && italicMatches.length % 2 !== 0) {
    repairedLine += "*";
  }

  // Count unclosed inline code (`)
  const backtickMatches = repairedLine.match(/(?<!`)`(?!`)/g);
  if (backtickMatches && backtickMatches.length % 2 !== 0) {
    repairedLine += "`";
  }

  // Count unclosed strikethrough (~~)
  const strikeMatches = repairedLine.match(/~~/g);
  if (strikeMatches && strikeMatches.length % 2 !== 0) {
    repairedLine += "~~";
  }

  return prefix + repairedLine;
}
