// Ingest layer: accumulates streaming tokens, detects block boundaries, and repairs incomplete markdown.
import type { StreamEvent } from "./types";

export class Ingest {
  private document = "";
  private closed = false;
  private lastBlockCount = 0;

  append(token: string): StreamEvent[] {
    if (this.closed) return [];
    if (!token) return [];

    this.document += token;
    return this.detectChanges();
  }

  end(): StreamEvent[] {
    if (this.closed) return [];
    this.closed = true;

    const events = this.detectChanges();
    if (this.lastBlockCount > 0) {
      events.push({ type: "block:complete", blockId: this.lastBlockCount - 1 });
    }
    events.push({ type: "stream:end" });
    return events;
  }

  getRepaired(): string {
    return repair(this.document);
  }

  getRaw(): string {
    return this.document;
  }

  get isStreaming(): boolean {
    return !this.closed;
  }

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
      for (let i = this.lastBlockCount; i < newCount; i++) {
        if (i > 0) {
          events.push({ type: "block:complete", blockId: i - 1 });
        }
        events.push({ type: "block:new", blockId: i });
      }
    } else if (newCount === this.lastBlockCount && newCount > 0) {
      events.push({ type: "block:update", blockId: newCount - 1 });
    }

    this.lastBlockCount = newCount;
    return events;
  }
}

// ── Block splitting ────────────────────────────────────────────────

/** Splits a markdown document into block-level chunks, preserving fenced regions. */
export const splitBlocks = (document: string): string[] => {
  if (!document) return [];

  const lines = document.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let inCodeFence = false;
  let inMathBlock = false;
  let fenceChar = "";

  for (const line of lines) {
    const trimmed = line.trimStart();

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

    if (!inCodeFence && trimmed.startsWith("$$")) {
      const mathFenceCount = (trimmed.match(/\$\$/g) ?? []).length;
      if (mathFenceCount % 2 !== 0) {
        inMathBlock = !inMathBlock;
      }
    }

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
};

// ── Syntax repair ──────────────────────────────────────────────────

/** Closes unclosed fences, math delimiters, and inline formatting for mid-stream display. */
export const repair = (text: string): string => {
  let result = text;

  result = normalizeDelimiters(result);
  result = repairCodeFences(result);
  result = repairMathBlocks(result);
  result = repairInlineFormatting(result);

  return result;
};

const normalizeDelimiters = (text: string): string => {
  // $$ in replacement string is special (inserts literal $), so use $$$$
  let result = text.replace(/\\\[/g, "$$$$");
  result = result.replace(/\\\]/g, "$$$$");
  result = result.replace(/\\\(/g, "$$");
  result = result.replace(/\\\)/g, "$$");
  return result;
};

const repairCodeFences = (text: string): string => {
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
};

const repairMathBlocks = (text: string): string => {
  let count = 0;
  let inCodeFence = false;

  for (const line of text.split("\n")) {
    const trimmed = line.trimStart();
    if (trimmed.match(/^(`{3,}|~{3,})/)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (!inCodeFence && trimmed.includes("$$")) {
      const matches = trimmed.match(/\$\$/g);
      if (matches) count += matches.length;
    }
  }

  if (count % 2 !== 0) {
    return text + "\n$$";
  }
  return text;
};

const repairInlineFormatting = (text: string): string => {
  let result = text;

  const lastNewline = result.lastIndexOf("\n");
  const lastLine = lastNewline >= 0 ? result.slice(lastNewline + 1) : result;
  const prefix = lastNewline >= 0 ? result.slice(0, lastNewline + 1) : "";

  let repairedLine = lastLine;

  const boldMatches = repairedLine.match(/\*\*/g);
  if (boldMatches && boldMatches.length % 2 !== 0) {
    repairedLine += "**";
  }

  const withoutBold = repairedLine.replace(/\*\*/g, "");
  const italicMatches = withoutBold.match(/\*/g);
  if (italicMatches && italicMatches.length % 2 !== 0) {
    repairedLine += "*";
  }

  const backtickMatches = repairedLine.match(/(?<!`)`(?!`)/g);
  if (backtickMatches && backtickMatches.length % 2 !== 0) {
    repairedLine += "`";
  }

  const strikeMatches = repairedLine.match(/~~/g);
  if (strikeMatches && strikeMatches.length % 2 !== 0) {
    repairedLine += "~~";
  }

  return prefix + repairedLine;
};
