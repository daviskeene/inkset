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

const LATEX_BEGIN_RE = /\\begin\{[A-Za-z*]+\}/g;
const LATEX_END_RE = /\\end\{[A-Za-z*]+\}/g;
const LATEX_MATH_ENV_START_RE =
  /^\\begin\{(equation|align|aligned|gather|gathered|alignat|alignedat|multline|split|array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|Bmatrix|cases|dcases|rcases|smallmatrix|subarray|CD)\*?\}/;
const ATX_HEADING_RE = /^(?: {0,3})(?:#{1,6})(?:\s+.*)?$/;
const STANDALONE_MATH_FENCE_RE = /^\$\$\s*$/;

/** Splits a markdown document into block-level chunks, preserving fenced regions. */
export const splitBlocks = (document: string): string[] => {
  if (!document) return [];

  const lines = document.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let inCodeFence = false;
  let inMathBlock = false;
  let latexEnvDepth = 0;
  let fenceChar = "";

  for (const line of lines) {
    const trimmed = line.trimStart();
    const isStandaloneMathFence = STANDALONE_MATH_FENCE_RE.test(line.trim());
    const startsLatexMathEnv =
      !inCodeFence && !inMathBlock && latexEnvDepth === 0 && LATEX_MATH_ENV_START_RE.test(trimmed);

    if (!inMathBlock && latexEnvDepth === 0) {
      const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
      if (fenceMatch) {
        if (!inCodeFence) {
          inCodeFence = true;
          fenceChar = fenceMatch[1][0];
        } else if (
          trimmed.startsWith(fenceChar.repeat(3)) &&
          trimmed.trim().length <= fenceMatch[1].length + 1
        ) {
          inCodeFence = false;
          fenceChar = "";
        }
      }
    }

    if (!inCodeFence && !inMathBlock && latexEnvDepth === 0 && ATX_HEADING_RE.test(line)) {
      if (current.length > 0) {
        blocks.push(current.join("\n"));
        current = [];
      }
      blocks.push(line);
      continue;
    }

    if (startsLatexMathEnv && current.length > 0) {
      blocks.push(current.join("\n"));
      current = [];
    }

    if (!inCodeFence && !inMathBlock && latexEnvDepth === 0) {
      const segments = splitCompleteDisplayMathSpans(line);
      if (segments) {
        for (const segment of segments) {
          if (segment.type === "text") {
            if (segment.value.trim() !== "") {
              current.push(segment.value.trim());
            }
            continue;
          }

          if (current.length > 0) {
            blocks.push(current.join("\n"));
            current = [];
          }
          blocks.push(segment.value.trim());
        }
        continue;
      }
    }

    if (!inCodeFence && inMathBlock) {
      const closeIndex = findDisplayMathFence(line, 0);
      if (closeIndex !== -1) {
        current.push(line.slice(0, closeIndex + 2));
        blocks.push(current.join("\n"));
        current = [];
        inMathBlock = false;

        const after = line.slice(closeIndex + 2).trim();
        if (after !== "") current.push(after);
        continue;
      }
    }

    if (!inCodeFence && !inMathBlock && latexEnvDepth === 0 && isStandaloneMathFence) {
      if (current.length > 0) {
        blocks.push(current.join("\n"));
        current = [];
      }
      current.push(line);
      inMathBlock = true;
      continue;
    }

    if (!inCodeFence && !inMathBlock && latexEnvDepth === 0) {
      const openIndex = findDisplayMathFence(line, 0);
      if (openIndex !== -1) {
        const before = line.slice(0, openIndex).trim();
        if (before !== "") current.push(before);
        if (current.length > 0) {
          blocks.push(current.join("\n"));
          current = [];
        }
        current.push(line.slice(openIndex));
        inMathBlock = true;
        continue;
      }
    }

    const wasInLatexEnv = latexEnvDepth > 0 || startsLatexMathEnv;
    if (!inCodeFence) {
      const begins = (line.match(LATEX_BEGIN_RE) ?? []).length;
      const ends = (line.match(LATEX_END_RE) ?? []).length;
      latexEnvDepth = Math.max(0, latexEnvDepth + begins - ends);
    }

    if (trimmed === "" && !inCodeFence && !inMathBlock && latexEnvDepth === 0) {
      if (current.length > 0) {
        blocks.push(current.join("\n"));
        current = [];
      }
    } else {
      current.push(line);
      if (!inCodeFence && wasInLatexEnv && latexEnvDepth === 0) {
        blocks.push(current.join("\n"));
        current = [];
      }
    }
  }

  if (current.length > 0) {
    blocks.push(current.join("\n"));
  }

  return blocks;
};

type DisplayMathSegment = {
  type: "text" | "math";
  value: string;
};

const splitCompleteDisplayMathSpans = (line: string): DisplayMathSegment[] | null => {
  const first = findDisplayMathFence(line, 0);
  if (first === -1) return null;

  const segments: DisplayMathSegment[] = [];
  let cursor = 0;
  let foundMath = false;

  while (cursor < line.length) {
    const start = findDisplayMathFence(line, cursor);
    if (start === -1) break;

    const end = findDisplayMathFence(line, start + 2);
    if (end === -1)
      return foundMath ? segments.concat({ type: "text", value: line.slice(cursor) }) : null;

    if (start > cursor) {
      segments.push({ type: "text", value: line.slice(cursor, start) });
    }

    segments.push({ type: "math", value: line.slice(start, end + 2) });
    foundMath = true;
    cursor = end + 2;
  }

  if (!foundMath) return null;
  if (cursor < line.length) {
    segments.push({ type: "text", value: line.slice(cursor) });
  }

  return segments;
};

const findDisplayMathFence = (line: string, fromIndex: number): number => {
  for (let index = fromIndex; index < line.length - 1; index++) {
    if (line[index] !== "$" || line[index + 1] !== "$") continue;
    if (line[index - 1] === "\\") continue;
    if (isInsideInlineCodeSpan(line, index)) continue;
    return index;
  }

  return -1;
};

const isInsideInlineCodeSpan = (line: string, targetIndex: number): boolean => {
  let cursor = 0;

  while (cursor < targetIndex) {
    if (line[cursor] !== "`") {
      cursor++;
      continue;
    }

    let tickCount = 1;
    while (line[cursor + tickCount] === "`") {
      tickCount++;
    }

    const delimiter = "`".repeat(tickCount);
    const end = line.indexOf(delimiter, cursor + tickCount);
    if (end === -1) return false;
    if (targetIndex > cursor && targetIndex < end) return true;

    cursor = end + tickCount;
  }

  return false;
};

// ── Syntax repair ──────────────────────────────────────────────────

/** Closes unclosed fences, math delimiters, and inline formatting for mid-stream display. */
export const repair = (text: string): string => {
  let result = text;

  result = normalizeDelimiters(result);
  result = repairCodeFences(result);
  result = repairMathBlocks(result);
  result = resolveEquationRefs(result);
  result = repairInlineFormatting(result);

  return result;
};

// AMS numbered environments (starred variants don't number).
const NUMBERED_ENVS = new Set(["equation", "align", "gather", "multline", "alignat", "eqnarray"]);

const LATEX_ENV_BODY_RE = /\\begin\{([A-Za-z]+\*?)\}([\s\S]*?)\\end\{\1\}/g;

/**
 * Resolves `\eqref{name}` in the document by scanning `\begin…\end` blocks for
 * `\label{name}` + `\tag{N}` (or auto-incremented counter). Outside env bodies
 * the resolved ref becomes `$(N)$` so it picks up math styling; inside an env
 * it stays as bare `(N)` since `$` would break KaTeX.
 */
const resolveEquationRefs = (text: string): string => {
  // Fast path for the common case: no refs to resolve means no scanning needed.
  // `includes` is a single SIMD-accelerated substring scan; far cheaper than the
  // two full-doc regex passes below. Keeps the per-token repair cost at zero
  // for non-math streams.
  if (!text.includes("\\eqref{")) return text;

  const labels = new Map<string, string>();
  let counter = 0;

  let m: RegExpExecArray | null;
  LATEX_ENV_BODY_RE.lastIndex = 0;
  while ((m = LATEX_ENV_BODY_RE.exec(text)) !== null) {
    const rawEnv = m[1];
    const env = rawEnv.replace(/\*$/, "");
    const starred = rawEnv.endsWith("*");
    const body = m[2];
    const labelMatch = body.match(/\\label\{([^}]*)\}/);
    const tagMatch = body.match(/\\tag\{([^}]*)\}/);

    if (tagMatch) {
      if (labelMatch) labels.set(labelMatch[1], tagMatch[1]);
    } else if (NUMBERED_ENVS.has(env) && !starred) {
      counter++;
      if (labelMatch) labels.set(labelMatch[1], String(counter));
    }
  }

  if (labels.size === 0) return text;

  const chunks: string[] = [];
  let lastEnd = 0;
  LATEX_ENV_BODY_RE.lastIndex = 0;
  while ((m = LATEX_ENV_BODY_RE.exec(text)) !== null) {
    chunks.push(replaceEqref(text.slice(lastEnd, m.index), labels, true));
    chunks.push(replaceEqref(m[0], labels, false));
    lastEnd = m.index + m[0].length;
  }
  chunks.push(replaceEqref(text.slice(lastEnd), labels, true));
  return chunks.join("");
};

const replaceEqref = (text: string, labels: Map<string, string>, wrap: boolean): string =>
  text.replace(/\\eqref\{([^}]*)\}/g, (raw, name: string) => {
    const tag = labels.get(name);
    if (!tag) return raw;
    return wrap ? `$(${tag})$` : `(${tag})`;
  });

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
  const result = text;

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
