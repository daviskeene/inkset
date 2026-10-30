// Incremental highlighting must render exactly what a full `codeToHtml` pass
// renders, at every point of a stream, while tokenizing each line about once.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createHighlighter, hastToHtml, type Highlighter } from "shiki";
import {
  createHighlightCache,
  highlightIncremental,
  type HighlightedCode,
  type IncrementalHighlighter,
} from "../src/incremental.js";

const SOURCE = `// A block comment that spans
/* several lines, so the grammar state
   has to carry across the cached boundary */
import { pipeline } from "./pipeline";

const template = \`multi-line
  template \${pipeline.width} literal
\`;

export async function measure(blocks: string[], width = 320): Promise<number> {
  let total = 0;

  for (const [index, block] of blocks.entries()) {
    // Lines that end mid-token while streaming: "unterminated string
    total += await pipeline.measure(block, { width: width + index * 8 });
  }
  return total; // done
}
`;

const toHtml = (result: HighlightedCode): string =>
  `<pre class="${result.preClassName}" style="${result.preStyle}" tabindex="0"><code>${result.lines
    .map((line) => `<span class="line">${line}</span>`)
    .join("\n")}</code></pre>`;

let highlighter: Highlighter;

beforeAll(async () => {
  highlighter = await createHighlighter({
    themes: ["github-dark", "github-light"],
    langs: ["typescript"],
  });
}, 30000);

describe("highlightIncremental", () => {
  it("matches codeToHtml at every prefix of a stream", () => {
    for (const theme of ["github-dark", "github-light"]) {
      const cache = createHighlightCache();
      for (let end = 0; end <= SOURCE.length; end += 7) {
        const prefix = SOURCE.slice(0, end);
        const incremental = highlightIncremental(
          highlighter,
          hastToHtml,
          prefix,
          "typescript",
          theme,
          cache,
        );
        expect(toHtml(incremental)).toBe(
          highlighter.codeToHtml(prefix, { lang: "typescript", theme }),
        );
      }
    }
  });

  it("tokenizes each line about once instead of re-highlighting the block", () => {
    const tokenized: string[] = [];
    const spy: IncrementalHighlighter = {
      codeToHast: (code, options) => {
        tokenized.push(code);
        return highlighter.codeToHast(code, options as Parameters<Highlighter["codeToHast"]>[1]);
      },
      getLastGrammarState: (root) =>
        highlighter.getLastGrammarState(root as Parameters<Highlighter["getLastGrammarState"]>[0]),
    };
    const cache = createHighlightCache();
    const long = SOURCE.repeat(8);
    for (let end = 0; end <= long.length; end += 5) {
      highlightIncremental(spy, hastToHtml, long.slice(0, end), "typescript", "github-dark", cache);
    }

    // Completed lines once, plus the growing tail on each update. A full pass
    // per update would tokenize ~long.length² / 10 characters.
    const total = tokenized.reduce((sum, code) => sum + code.length, 0);
    expect(total).toBeLessThan(long.length * 12);
  });

  // remark ends a code block's text with a newline, so while a block streams
  // every update ends in "\n", including updates that stop mid-line.
  it("keeps its cache when each update ends in a newline, as remark's code does", () => {
    const tokenized: string[] = [];
    const spy: IncrementalHighlighter = {
      codeToHast: (code, options) => {
        tokenized.push(code);
        return highlighter.codeToHast(code, options as Parameters<Highlighter["codeToHast"]>[1]);
      },
      getLastGrammarState: (root) =>
        highlighter.getLastGrammarState(root as Parameters<Highlighter["getLastGrammarState"]>[0]),
    };
    const cache = createHighlightCache();
    const long = SOURCE.repeat(8);
    for (let end = 0; end <= long.length; end += 5) {
      const code = `${long.slice(0, end)}\n`;
      const result = highlightIncremental(
        spy,
        hastToHtml,
        code,
        "typescript",
        "github-dark",
        cache,
      );
      if (end % 200 === 0) {
        expect(toHtml(result)).toBe(
          highlighter.codeToHtml(code, { lang: "typescript", theme: "github-dark" }),
        );
      }
    }

    const total = tokenized.reduce((sum, code) => sum + code.length, 0);
    expect(total).toBeLessThan(long.length * 12);
  });

  it("starts over when the code is replaced rather than extended", () => {
    const cache = createHighlightCache();
    highlightIncremental(
      highlighter,
      hastToHtml,
      "const a = 1;\nconst b",
      "typescript",
      "github-dark",
      cache,
    );
    const replaced = "let x = 'y';\n";
    const result = highlightIncremental(
      highlighter,
      hastToHtml,
      replaced,
      "typescript",
      "github-dark",
      cache,
    );
    expect(toHtml(result)).toBe(
      highlighter.codeToHtml(replaced, { lang: "typescript", theme: "github-dark" }),
    );
  });

  it("propagates shiki errors for unloaded languages", () => {
    const cache = createHighlightCache();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() =>
      highlightIncremental(highlighter, hastToHtml, "fn main() {}", "rust", "github-dark", cache),
    ).toThrow();
    warn.mockRestore();
  });
});
