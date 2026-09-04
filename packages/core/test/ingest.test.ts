// Tests for the ingest layer: block splitting, syntax repair, and streaming token accumulation.
import { describe, it, expect } from "vitest";
import { Ingest, splitBlocks, repair } from "../src/ingest.js";
import { createBlocks } from "../src/parse.js";

const createBlocksForTest = (raw: string[]) => createBlocks(raw).map((block) => block.type);

describe("splitBlocks", () => {
  it("splits on blank lines", () => {
    const doc = "Hello world\n\nSecond paragraph";
    const blocks = splitBlocks(doc);
    expect(blocks).toEqual(["Hello world", "Second paragraph"]);
  });

  it("returns empty array for empty input", () => {
    expect(splitBlocks("")).toEqual([]);
  });

  it("returns single block for single paragraph", () => {
    const blocks = splitBlocks("Just one paragraph");
    expect(blocks).toEqual(["Just one paragraph"]);
  });

  it("keeps code fences together despite blank lines inside", () => {
    const doc = "Before\n\n```python\ndef hello():\n    pass\n\n# comment\n```\n\nAfter";
    const blocks = splitBlocks(doc);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toBe("Before");
    expect(blocks[1]).toContain("```python");
    expect(blocks[1]).toContain("# comment");
    expect(blocks[2]).toBe("After");
  });

  it("keeps math blocks together despite blank lines inside", () => {
    const doc = "Before\n\n$$\nx = 1\n\ny = 2\n$$\n\nAfter";
    const blocks = splitBlocks(doc);
    expect(blocks).toHaveLength(3);
    expect(blocks[1]).toContain("$$");
  });

  it("does not merge single-line display math with following blocks", () => {
    const doc = "Before\n\n$$x = 1$$\n\n## After";
    const blocks = splitBlocks(doc);
    expect(blocks).toEqual(["Before", "$$x = 1$$", "## After"]);
  });

  it("splits single-line display math without surrounding blank lines", () => {
    const doc = "Thus\n$$pu+qv=2^{k},\\qquad qu+pv=2^{m}$$\nand $qu<pv$.";
    const blocks = splitBlocks(doc);
    expect(blocks).toEqual(["Thus", "$$pu+qv=2^{k},\\qquad qu+pv=2^{m}$$", "and $qu<pv$."]);
  });

  it("splits inline-positioned display math spans out of prose", () => {
    const doc = "Consequently $$q-p=2,\\qquad p+q=2^{m-1}.$$ Thus $p=1$.";
    const blocks = splitBlocks(doc);
    expect(blocks).toEqual(["Consequently", "$$q-p=2,\\qquad p+q=2^{m-1}.$$", "Thus $p=1$."]);
  });

  it("does not split display-math examples inside inline code spans", () => {
    const doc = "The plugin claims display-math blocks such as `$$...$$`.";
    const blocks = splitBlocks(doc);
    expect(blocks).toEqual(["The plugin claims display-math blocks such as `$$...$$`."]);
  });

  it("does not split display-math examples inside multi-backtick code spans", () => {
    const doc =
      "- **Syntax repair.** Unterminated `**bold**`, `` `code` ``, `[links]()`, `$$math$$`, and fenced code blocks are auto-closed.";
    const blocks = splitBlocks(doc);
    expect(blocks).toEqual([
      "- **Syntax repair.** Unterminated `**bold**`, `` `code` ``, `[links]()`, `$$math$$`, and fenced code blocks are auto-closed.",
    ]);
  });

  it("handles multiple consecutive blank lines", () => {
    const blocks = splitBlocks("A\n\n\n\nB");
    expect(blocks).toEqual(["A", "B"]);
  });

  it("keeps bare \\begin{env}...\\end{env} blocks together", () => {
    const doc = "Before\n\n\\begin{equation}\nx + y = 1\n\\end{equation}\n\nAfter";
    const blocks = splitBlocks(doc);
    expect(blocks).toHaveLength(3);
    expect(blocks[1]).toContain("\\begin{equation}");
    expect(blocks[1]).toContain("\\end{equation}");
  });

  it("splits bare math environments without surrounding blank lines", () => {
    const doc =
      "Adding and subtracting give\n\\begin{equation}\n(p+q)(u+v)=2^{m}(2^{r}+1)\n\\end{equation}\n\\begin{equation}\n(q-p)(v-u)=2^{m}(2^{r}-1)\n\\end{equation}\nAll four factors are even.";
    const blocks = splitBlocks(doc);
    expect(blocks).toEqual([
      "Adding and subtracting give",
      "\\begin{equation}\n(p+q)(u+v)=2^{m}(2^{r}+1)\n\\end{equation}",
      "\\begin{equation}\n(q-p)(v-u)=2^{m}(2^{r}-1)\n\\end{equation}",
      "All four factors are even.",
    ]);
  });

  it("handles nested LaTeX environments", () => {
    const doc =
      "\\begin{equation}\n\\begin{aligned}\na &= b\\\\\n\nc &= d\n\\end{aligned}\n\\end{equation}\n\nAfter";
    const blocks = splitBlocks(doc);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("\\begin{aligned}");
    expect(blocks[0]).toContain("\\end{equation}");
    expect(blocks[1]).toBe("After");
  });

  it("splits ATX headings without surrounding blank lines", () => {
    const doc =
      "where the last power series converges in a neighborhood of infinity.\n## Theorem\nLet r be a noncommutative random variable";
    const blocks = splitBlocks(doc);
    expect(blocks).toEqual([
      "where the last power series converges in a neighborhood of infinity.",
      "## Theorem",
      "Let r be a noncommutative random variable",
    ]);
  });

  it("does not split ATX-looking lines inside code fences", () => {
    const doc = "Before\n\n```\n## Not a heading\n```\nAfter";
    const blocks = splitBlocks(doc);
    expect(blocks).toEqual(["Before", "```\n## Not a heading\n```\nAfter"]);
  });

  it("does not split indented code as ATX headings", () => {
    const doc = "Before\n\n    # Not a heading\n    still code\n\nAfter";
    const blocks = splitBlocks(doc);
    expect(blocks).toEqual(["Before", "    # Not a heading\n    still code", "After"]);
  });

  it("splits empty ATX headings without surrounding blank lines", () => {
    const blocks = splitBlocks("Before\n###\nAfter");
    expect(blocks).toEqual(["Before", "###", "After"]);
  });

  it("treats standalone display math fences as block boundaries without blank lines", () => {
    const doc =
      "The scalar Cauchy transform is defined as\n$$\nG_{\\mu}(\\zeta):=\\int_{\\mathbb{R}}\\frac{\\mu(\\mathrm{d}\\xi)}{\\zeta-\\xi}.\n$$\nFor a noncommutative random variable";
    const blocks = splitBlocks(doc);
    expect(blocks).toEqual([
      "The scalar Cauchy transform is defined as",
      "$$\nG_{\\mu}(\\zeta):=\\int_{\\mathbb{R}}\\frac{\\mu(\\mathrm{d}\\xi)}{\\zeta-\\xi}.\n$$",
      "For a noncommutative random variable",
    ]);
  });

  it("keeps multi-line display math fenced by inline $$ boundaries without blank lines", () => {
    const doc =
      "For $m\\ge1$ integrate by parts:\n$$I_m=[x(1+x^2)^m]_0^1-2m\\!\\int_0^1x^2(1+x^2)^{m-1}dx\n=2^m-2m\\!\\int_0^1[(1+x^2)-1](1+x^2)^{m-1}dx.$$\nHence $(2m+1)I_m=2^m+2mI_{m-1}$.";
    const blocks = splitBlocks(doc);
    expect(blocks).toEqual([
      "For $m\\ge1$ integrate by parts:",
      "$$I_m=[x(1+x^2)^m]_0^1-2m\\!\\int_0^1x^2(1+x^2)^{m-1}dx\n=2^m-2m\\!\\int_0^1[(1+x^2)-1](1+x^2)^{m-1}dx.$$",
      "Hence $(2m+1)I_m=2^m+2mI_{m-1}$.",
    ]);
  });
});

describe("repair", () => {
  it("auto-closes unclosed code fences", () => {
    const result = repair("```python\ndef hello():");
    expect(result).toContain("```");
    const lines = result.split("\n");
    expect(lines[lines.length - 1]).toBe("```");
  });

  it("leaves closed code fences unchanged", () => {
    const doc = "```\ncode\n```";
    expect(repair(doc)).toBe(doc);
  });

  it("auto-closes unclosed bold", () => {
    const result = repair("This is **bold");
    expect(result).toContain("**bold**");
  });

  it("auto-closes unclosed italic", () => {
    const result = repair("This is *italic");
    expect(result).toContain("*italic*");
  });

  it("auto-closes unclosed inline code", () => {
    const result = repair("This is `code");
    expect(result).toContain("`code`");
  });

  it("auto-closes unclosed strikethrough", () => {
    const result = repair("This is ~~strike");
    expect(result).toContain("~~strike~~");
  });

  it("normalizes \\[ to $$", () => {
    const result = repair("\\[x = 1\\]");
    expect(result).toBe("$$x = 1$$");
  });

  it("normalizes \\( to $", () => {
    const result = repair("\\(x = 1\\)");
    expect(result).toBe("$x = 1$");
  });

  it("auto-closes unclosed math block", () => {
    const result = repair("$$\nx = 1");
    expect(result.match(/\$\$/g)?.length).toBe(2);
  });

  it("resolves \\eqref to tag number with \\tag{N}", () => {
    const doc =
      "\\begin{equation}\\tag{5}\\label{eq:foo} x = 1 \\end{equation}\n\nSee \\eqref{eq:foo}.";
    const result = repair(doc);
    expect(result).toContain("See $(5)$.");
  });

  it("auto-numbers unlabeled numbered envs for \\eqref", () => {
    const doc =
      "\\begin{equation}\\label{a} a \\end{equation}\n\n\\begin{equation}\\label{b} b \\end{equation}\n\n\\eqref{b} then \\eqref{a}";
    const result = repair(doc);
    expect(result).toContain("$(2)$ then $(1)$");
  });

  it("skips starred envs for auto-numbering", () => {
    const doc =
      "\\begin{equation*}\\label{a} a \\end{equation*}\n\n\\begin{equation}\\label{b} b \\end{equation}\n\n\\eqref{b}";
    const result = repair(doc);
    expect(result).toContain("$(1)$");
  });

  it("leaves unresolvable \\eqref untouched", () => {
    const doc = "See \\eqref{missing}.";
    expect(repair(doc)).toBe(doc);
  });

  it("uses bare (N) for \\eqref inside env bodies", () => {
    const doc =
      "\\begin{equation}\\tag{3}\\label{x} y = 1 \\end{equation}\n\n\\begin{equation} z = \\eqref{x} \\end{equation}";
    const result = repair(doc);
    expect(result).toContain("z = (3)");
    expect(result).not.toContain("z = $(3)$");
  });

  it("handles already-complete text", () => {
    const doc = "Hello **bold** and *italic* world";
    expect(repair(doc)).toBe(doc);
  });
});

describe("Ingest", () => {
  it("accumulates tokens", () => {
    const ingest = new Ingest();
    ingest.append("Hello ");
    ingest.append("world");
    expect(ingest.getRaw()).toBe("Hello world");
  });

  it("emits block:new on first token", () => {
    const ingest = new Ingest();
    const events = ingest.append("Hello");
    expect(events).toContainEqual({ type: "block:new", blockId: 0 });
  });

  it("emits block:update on subsequent tokens in same block", () => {
    const ingest = new Ingest();
    ingest.append("Hello");
    const events = ingest.append(" world");
    expect(events).toContainEqual({ type: "block:update", blockId: 0 });
  });

  it("emits block:complete + block:new on new block", () => {
    const ingest = new Ingest();
    ingest.append("First paragraph");
    const events = ingest.append("\n\nSecond paragraph");
    expect(events).toContainEqual({ type: "block:complete", blockId: 0 });
    expect(events).toContainEqual({ type: "block:new", blockId: 1 });
  });

  it("emits stream:end on end()", () => {
    const ingest = new Ingest();
    ingest.append("Hello");
    const events = ingest.end();
    expect(events).toContainEqual({ type: "stream:end" });
  });

  it("ignores tokens after stream end", () => {
    const ingest = new Ingest();
    ingest.append("Hello");
    ingest.end();
    const events = ingest.append("more");
    expect(events).toEqual([]);
    expect(ingest.getRaw()).toBe("Hello");
  });

  it("returns repaired text", () => {
    const ingest = new Ingest();
    ingest.append("**bold");
    expect(ingest.getRepaired()).toContain("**bold**");
  });

  it("tracks streaming state", () => {
    const ingest = new Ingest();
    expect(ingest.isStreaming).toBe(true);
    ingest.end();
    expect(ingest.isStreaming).toBe(false);
  });

  it("can be reset", () => {
    const ingest = new Ingest();
    ingest.append("Hello");
    ingest.end();
    ingest.reset();
    expect(ingest.getRaw()).toBe("");
    expect(ingest.isStreaming).toBe(true);
  });
});

describe("Ingest block-merge events", () => {
  it("emits an update when appending merges blocks (count decrease)", () => {
    const ingest = new Ingest();
    // Unclosed inline code: the $$ pair is live, so this splits into blocks.
    ingest.append("a `$$b$$");
    // Closing the code span protects the $$, merging everything into one block.
    const events = ingest.append("` c");

    expect(events.length).toBeGreaterThan(0);
    expect(events).toContainEqual({ type: "block:update", blockId: 0 });
  });
});

describe("normalizeDelimiters (CommonMark escapes vs LaTeX delimiters)", () => {
  it("keeps escaped brackets around prose as literal escapes", () => {
    const input =
      "Escaped characters: \\*not italic\\*, \\_not italic\\_, \\[brackets\\], \\(parens\\)";
    expect(repair(input, { closed: true })).toBe(input);
    expect(repair("see \\[citation needed\\] and \\[1\\]", { closed: true })).toBe(
      "see \\[citation needed\\] and \\[1\\]",
    );
  });

  it("promotes bracketed math to dollar delimiters", () => {
    expect(repair("Let \\(x^2 + y^2 = r^2\\) hold.")).toBe("Let $x^2 + y^2 = r^2$ hold.");
    expect(repair("Then \\[ E = mc^2 \\] follows.")).toBe("Then $$ E = mc^2 $$ follows.");
    expect(repair("\\(\\alpha\\) and \\(n\\) and \\(f(x)\\)")).toBe("$\\alpha$ and $n$ and $f(x)$");
  });

  it("promotes multi-line display math", () => {
    expect(repair("\\[\nE = mc^2\n\\]")).toBe("$$\nE = mc^2\n$$");
  });

  it("leaves fenced code untouched", () => {
    const input = "```js\nconst re = /\\[a-z\\]/;\n```";
    expect(repair(input)).toBe(input);
  });

  it("leaves inline code untouched and appends no math fence", () => {
    const input = "Use `\\[` to escape.";
    expect(repair(input, { closed: true })).toBe(input);
  });

  it("does not treat a LaTeX line break like \\\\[2pt] as a delimiter", () => {
    const input = "$$\n\\begin{aligned}\na \\\\[2pt]\nb\n\\end{aligned}\n$$";
    expect(repair(input)).toBe(input);
  });

  it("promotes an unclosed display opener at the end of a stream", () => {
    expect(repair("Then \\[ E = mc^")).toBe("Then $$ E = mc^\n$$");
  });

  it("leaves an unclosed escape before prose alone", () => {
    expect(repair("see \\[brackets")).toBe("see \\[brackets");
  });

  it("does not pair delimiters across a blank line", () => {
    const input = "a \\(x\n\nb y\\)";
    expect(repair(input, { closed: true })).toBe(input);
  });
});

describe("repair false positives", () => {
  it("does not append a stray * after single-line display math", () => {
    expect(repair("$$ a * b $$")).toBe("$$ a * b $$");
  });

  it("ignores delimiters inside inline code and inline math", () => {
    expect(repair("Use `SELECT *` sparingly.")).toBe("Use `SELECT *` sparingly.");
    expect(repair("The optimum is $x^*$.")).toBe("The optimum is $x^*$.");
  });

  it("still closes unbalanced emphasis outside protected spans", () => {
    expect(repair("`SELECT *` and *emph")).toBe("`SELECT *` and *emph*");
  });

  it("skips inline repair once the document is closed", () => {
    expect(repair("The answer is 2 * 3")).toBe("The answer is 2 * 3*");
    expect(repair("The answer is 2 * 3", { closed: true })).toBe("The answer is 2 * 3");
  });

  it("does not treat a closing tilde fence as strikethrough", () => {
    expect(repair("~~~\ncode\n~~~")).toBe("~~~\ncode\n~~~");
  });

  it("does not count $$ inside inline code as a math fence", () => {
    const input = "Wrap display math in `$$`.\n\nNext.";
    expect(repair(input)).toBe(input);
  });

  it("stops applying inline repair after the stream ends", () => {
    const ingest = new Ingest();
    ingest.append("2 * 3");
    expect(ingest.getRepaired()).toBe("2 * 3*");
    ingest.end();
    expect(ingest.getRepaired()).toBe("2 * 3");
  });
});

describe("single-line display math (issue #14 regression)", () => {
  const M = "$$ \\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi} $$";
  const mathBlocks = (doc: string) =>
    createBlocksForTest(splitBlocks(repair(doc, { closed: true })));

  it("is a math-display block in every surrounding context", () => {
    const docs = [
      M,
      `The Gaussian integral:\n${M}`,
      `Intro\n\n${M}\n\nDone.`,
      `- Gaussian: ${M}`,
      `Intro\r\n\r\n${M}\r\n\r\nDone.`,
      `    ${M}`,
      `Let $x\\in\\mathbb{R}$. Then ${M}`,
      `Result: ${M}`,
      `${M}.`,
    ];
    for (const doc of docs) {
      const types = mathBlocks(doc);
      expect(types, doc).toContain("math-display");
    }
  });

  it("survives token-by-token streaming", () => {
    const doc = `Intro paragraph.\n\n${M}\n\nAfter.`;
    const ingest = new Ingest();
    for (let i = 0; i < doc.length; i += 3) ingest.append(doc.slice(i, i + 3));
    ingest.end();
    expect(createBlocksForTest(splitBlocks(ingest.getRepaired()))).toEqual([
      "paragraph",
      "math-display",
      "paragraph",
    ]);
  });

  it("treats tilde fences as code", () => {
    expect(
      createBlocksForTest(splitBlocks(repair("~~~\nsome code\n~~~", { closed: true }))),
    ).toEqual(["code"]);
  });
});
