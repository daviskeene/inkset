// Tests for the ingest layer: block splitting, syntax repair, and streaming token accumulation.
import { describe, it, expect } from "vitest";
import { Ingest, splitBlocks, repair } from "../src/ingest.js";

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
