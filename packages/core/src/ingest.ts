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
    return repair(this.document, { closed: this.closed });
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
    } else if (newCount < this.lastBlockCount && newCount > 0) {
      // Blocks merged (e.g. a fence opener swallowing what were separate
      // blocks). Without an event the pipeline never schedules an update and
      // the display goes stale until the next token.
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
const CODE_FENCE_RE = /^(`{3,}|~{3,})/;

type CodeFence = { char: string; length: number };
type CodeFenceLine = CodeFence & { rest: string };

// A fence nested in a blockquote or list item (`> ```js`, `- ~~~`) is still a
// fence: the container markers come off before the fence itself is matched.
const CONTAINER_PREFIX_RE = /^(?:>[ \t]?|(?:[-*+]|\d{1,9}[.)])[ \t]+)+/;

/** The fence marker on a (left-trimmed) line, or null. */
const matchCodeFence = (trimmed: string): CodeFenceLine | null => {
  const line = trimmed.replace(CONTAINER_PREFIX_RE, "").trimStart();
  const match = line.match(CODE_FENCE_RE);
  if (!match) return null;
  const rest = line.slice(match[1].length);
  // CommonMark: the info string of a backtick fence cannot contain backticks,
  // so "```code``` inline" is a code span, not an opener that swallows the
  // rest of the document.
  if (match[1][0] === "`" && rest.includes("`")) return null;
  return { char: match[1][0], length: match[1].length, rest };
};

/**
 * CommonMark §4.5: a closing fence uses the same character as the opener, is
 * at least as long, and carries nothing but whitespace. Shared by the splitter
 * and every repair pass so all stages agree on where code regions begin and
 * end — a ```` ```` ```` block that *shows* a ```` ``` ```` block must stay one block.
 */
const closesCodeFence = (fence: CodeFenceLine, open: CodeFence | null): boolean =>
  open !== null &&
  fence.char === open.char &&
  fence.length >= open.length &&
  fence.rest.trim() === "";

/** Advances fence state for one line; returns the state after the line. */
const stepCodeFence = (trimmed: string, open: CodeFence | null): CodeFence | null => {
  const fence = matchCodeFence(trimmed);
  if (!fence) return open;
  if (open === null) return { char: fence.char, length: fence.length };
  return closesCodeFence(fence, open) ? null : open;
};

/** Splits a markdown document into block-level chunks, preserving fenced regions. */
export const splitBlocks = (document: string): string[] => {
  if (!document) return [];

  const lines = document.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let openFence: CodeFence | null = null;
  let inMathBlock = false;
  let latexEnvDepth = 0;

  for (const line of lines) {
    const trimmed = line.trimStart();
    const isStandaloneMathFence = STANDALONE_MATH_FENCE_RE.test(line.trim());
    const startsLatexMathEnv =
      openFence === null &&
      !inMathBlock &&
      latexEnvDepth === 0 &&
      LATEX_MATH_ENV_START_RE.test(trimmed);

    if (!inMathBlock && latexEnvDepth === 0) {
      openFence = stepCodeFence(trimmed, openFence);
    }
    const inCodeFence = openFence !== null;

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

          if (segment.type === "open") {
            // `$$a$$ and $$b` — the tail opens a second display block that
            // continues on the next lines.
            current.push(segment.value.trim());
            inMathBlock = true;
            continue;
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

    // Bare `\begin{env} … \end{env}` blocks (no `$$` around them) are tracked
    // by nesting depth. Only a line that *starts* a math environment can open
    // that tracking: a `\begin{…}` mentioned in prose or inline code must not
    // swallow the rest of the document, and environments inside a `$$` block
    // are the math plugin's business, not the splitter's.
    const wasInLatexEnv = latexEnvDepth > 0 || startsLatexMathEnv;
    if (!inCodeFence && !inMathBlock && wasInLatexEnv) {
      const prose = maskInlineCodeSpans(line);
      const begins = (prose.match(LATEX_BEGIN_RE) ?? []).length;
      const ends = (prose.match(LATEX_END_RE) ?? []).length;
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
  /** `open` is an unclosed trailing `$$…` that starts a multi-line block. */
  type: "text" | "math" | "open";
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
    if (end === -1) {
      if (!foundMath) return null;
      if (start > cursor) {
        segments.push({ type: "text", value: line.slice(cursor, start) });
      }
      segments.push({ type: "open", value: line.slice(start) });
      return segments;
    }

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

/**
 * Index of the next `$$` fence at or after `fromIndex`. A fence is exactly two
 * dollars: `\$$` is escaped, `$$$` ("pricing: $$$") is prose, and anything
 * inside an inline code span is literal.
 */
const findDisplayMathFence = (line: string, fromIndex: number): number => {
  for (let index = fromIndex; index < line.length - 1; index++) {
    if (line[index] !== "$" || line[index + 1] !== "$") continue;
    if (line[index - 1] === "\\" || line[index - 1] === "$" || line[index + 2] === "$") continue;
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

export type RepairOptions = {
  /**
   * Whether the document is complete. Structural repairs (fences, `$$`
   * blocks, delimiter normalization) always run; the speculative inline
   * closers (`**`, `*`, `` ` ``, `~~`) only make sense while text is still
   * arriving and are skipped for a settled document so a genuine trailing
   * `*` or `` ` `` is never rewritten.
   */
  closed?: boolean;
};

/** Closes unclosed fences, math delimiters, and inline formatting for mid-stream display. */
export const repair = (text: string, options?: RepairOptions): string => {
  let result = text;

  result = normalizeDelimiters(result);
  result = repairCodeFences(result);
  result = repairMathBlocks(result);
  result = resolveEquationRefs(result);
  if (!options?.closed) {
    result = repairInlineFormatting(result);
  }

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

// ── Delimiter normalization ────────────────────────────────────────

/**
 * Rewrites LaTeX-style math delimiters (`\(…\)`, `\[…\]`) to the `$…$` and
 * `$$…$$` forms the rest of the pipeline understands. Two guards keep the
 * CommonMark contract intact:
 *
 * - Code is never touched. Fenced blocks and inline code spans pass through
 *   verbatim, so a regex like `/\[a-z\]/` in a JS snippet survives.
 * - Escaped brackets around prose stay escapes. `\[brackets\]` renders as the
 *   literal "[brackets]"; only content that reads as math (a TeX command, an
 *   operator, a short identifier) is promoted to a math span.
 *
 * A `\[` with no closer at the end of the document is still promoted when its
 * tail looks like math, so a display equation that is mid-stream renders as a
 * math block instead of flipping block type once `\]` arrives. An unclosed
 * `\(` is left alone.
 */
const normalizeDelimiters = (text: string): string => {
  if (!text.includes("\\[") && !text.includes("\\(")) return text;

  const lines = text.split("\n");
  const out: string[] = [];
  let region: string[] = [];
  let openFence: CodeFence | null = null;

  const flushRegion = (isDocumentTail: boolean) => {
    if (region.length === 0) return;
    out.push(rewriteMathDelimiters(region.join("\n"), isDocumentTail));
    region = [];
  };

  for (const line of lines) {
    const trimmed = line.trimStart();
    const nextFence = stepCodeFence(trimmed, openFence);

    if (openFence !== null || nextFence !== null) {
      // Inside a fence, or on the line that opens one: verbatim.
      if (openFence === null) flushRegion(false);
      out.push(line);
      openFence = nextFence;
      continue;
    }

    region.push(line);
  }

  flushRegion(true);
  return out.join("\n");
};

const rewriteMathDelimiters = (text: string, isDocumentTail: boolean): string => {
  let out = "";
  let cursor = 0;

  while (cursor < text.length) {
    const char = text[cursor];

    if (char === "`") {
      // Inline code passes through verbatim.
      let tickCount = 1;
      while (text[cursor + tickCount] === "`") tickCount++;
      const delimiter = "`".repeat(tickCount);
      const end = text.indexOf(delimiter, cursor + tickCount);
      if (end === -1) {
        out += delimiter;
        cursor += tickCount;
        continue;
      }
      out += text.slice(cursor, end + tickCount);
      cursor = end + tickCount;
      continue;
    }

    if (char !== "\\") {
      out += char;
      cursor++;
      continue;
    }

    const next = text[cursor + 1];
    if (next === "\\") {
      // `\\` is an escaped backslash (or a LaTeX line break such as `\\[2pt]`);
      // whatever follows it is not a delimiter.
      out += "\\\\";
      cursor += 2;
      continue;
    }

    if (next !== "(" && next !== "[") {
      out += char;
      cursor++;
      continue;
    }

    const display = next === "[";
    const closer = display ? "\\]" : "\\)";
    const end = findDelimiterCloser(text, closer, cursor + 2);

    if (end === -1) {
      if (display && isDocumentTail && !isEscapedProse(text.slice(cursor + 2))) {
        out += "$$";
        cursor += 2;
        continue;
      }
      out += text.slice(cursor, cursor + 2);
      cursor += 2;
      continue;
    }

    const inner = text.slice(cursor + 2, end);
    if (isEscapedProse(inner)) {
      out += text.slice(cursor, cursor + 2);
      cursor += 2;
      continue;
    }

    out += display ? `$$${inner}$$` : `$${inner}$`;
    cursor = end + 2;
  }

  return out;
};

/**
 * Finds `closer` at or after `fromIndex`, skipping inline code spans. Stops at
 * a blank line: neither inline nor display math may span paragraphs, so a
 * closer in a later paragraph is not a match.
 */
const findDelimiterCloser = (text: string, closer: string, fromIndex: number): number => {
  let cursor = fromIndex;

  while (cursor < text.length) {
    const char = text[cursor];

    if (char === "\n" && /^[ \t]*\n/.test(text.slice(cursor + 1))) return -1;

    if (char === "`") {
      let tickCount = 1;
      while (text[cursor + tickCount] === "`") tickCount++;
      const delimiter = "`".repeat(tickCount);
      const end = text.indexOf(delimiter, cursor + tickCount);
      cursor = end === -1 ? cursor + tickCount : end + tickCount;
      continue;
    }

    if (char === "\\") {
      if (text.startsWith(closer, cursor)) return cursor;
      cursor += 2;
      continue;
    }

    cursor++;
  }

  return -1;
};

const STRONG_MATH_SIGNAL_RE = /[\\^_={}+*/|<>]/;
const PROSE_WORD_RE = /[A-Za-z]{3,}/;

/**
 * Decides whether the content between `\(`…`\)` / `\[`…`\]` reads as prose,
 * in which case the brackets are CommonMark escapes and must be left alone.
 * Anything carrying a TeX command, operator, brace, sub/superscript or
 * comparison is math; so are one- and two-letter identifiers (`x`, `dx`) and
 * function application (`f(x)`). A bare number (`\[1\]`) or any three-letter
 * word (`\[citation needed\]`) is prose.
 */
const isEscapedProse = (inner: string): boolean => {
  const content = inner.trim();
  if (content.length === 0) return true;
  if (STRONG_MATH_SIGNAL_RE.test(content)) return false;
  if (/^[A-Za-z]{1,2}$/.test(content)) return false;
  if (/^[A-Za-z]['′]*\s*\(.*\)$/.test(content)) return false;
  if (/^[0-9][0-9.,]*$/.test(content)) return true;
  if (PROSE_WORD_RE.test(content)) return true;
  return false;
};

/** Replaces inline code spans with spaces so delimiter counting ignores them. */
const maskInlineCodeSpans = (line: string): string =>
  line.replace(/(`+)[^`]*?\1/g, (span) => " ".repeat(span.length));

/**
 * Replaces `$$…$$` and `$…$` spans with spaces. The inline rule mirrors the
 * parser's: an opener is a `$` not preceded by `\` or `$` and not followed by
 * `$`; a closer is a `$` not followed by a digit (so `$5 and $10` stays prose).
 */
const maskMathSpans = (line: string): string =>
  line
    .replace(/(?<!\\)\$\$[^$]*?\$\$/g, (span) => " ".repeat(span.length))
    .replace(/(?<![\\$])\$(?!\$)[^$\n]*?(?<!\\)\$(?![\d$])/g, (span) => " ".repeat(span.length));

const repairCodeFences = (text: string): string => {
  let openFence: CodeFence | null = null;

  for (const line of text.split("\n")) {
    openFence = stepCodeFence(line.trimStart(), openFence);
  }

  if (openFence) {
    return text + "\n" + openFence.char.repeat(openFence.length);
  }
  return text;
};

const repairMathBlocks = (text: string): string => {
  let count = 0;
  let openFence: CodeFence | null = null;

  for (const line of text.split("\n")) {
    const trimmed = line.trimStart();
    const nextFence = stepCodeFence(trimmed, openFence);
    if (nextFence !== openFence || matchCodeFence(trimmed)) {
      openFence = nextFence;
      continue;
    }
    if (openFence === null && trimmed.includes("$$")) {
      // `$$` inside inline code (``use `$$` for display math``), escaped as
      // `\$$`, or part of a `$$$` run is not a fence; the splitter ignores
      // those too, so counting them here would append a closer that never
      // pairs with anything.
      const matches = maskInlineCodeSpans(trimmed).match(/(?<![\\$])\$\$(?!\$)/g);
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

  // A fence line is structure, not prose; its `~~~` is not strikethrough.
  if (matchCodeFence(lastLine.trimStart())) return result;

  let repairedLine = lastLine;

  // Count delimiters with code and math spans masked out, so `$$ a * b $$`,
  // `` `SELECT *` `` or `$x^*$` never earn a stray closer. The masked copy is
  // only for counting; the appended closers go on the real line.
  const countable = maskMathSpans(maskInlineCodeSpans(lastLine));

  const boldMatches = countable.match(/\*\*/g);
  if (boldMatches && boldMatches.length % 2 !== 0) {
    repairedLine += "**";
  }

  const withoutBold = countable.replace(/\*\*/g, "");
  const italicMatches = withoutBold.match(/\*/g);
  if (italicMatches && italicMatches.length % 2 !== 0) {
    repairedLine += "*";
  }

  const backtickMatches = countable.match(/(?<!`)`(?!`)/g);
  if (backtickMatches && backtickMatches.length % 2 !== 0) {
    repairedLine += "`";
  }

  const strikeMatches = countable.match(/~~/g);
  if (strikeMatches && strikeMatches.length % 2 !== 0) {
    repairedLine += "~~";
  }

  return prefix + repairedLine;
};
