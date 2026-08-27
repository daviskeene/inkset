// Default-renderer (no plugin) measurement heuristics, checked against the
// fallback character-width model that runs in Node (9.6px per character at
// 16px, 24px lines).
import { describe, expect, it } from "vitest";
import { MeasureLayer } from "../src/measure.js";
import { createBlocks, parseBlock } from "../src/parse.js";
import type { EnrichedNode } from "../src/types.js";

const layer = new MeasureLayer({ font: "sans-serif", fontSize: 16, lineHeight: 24 });
const nodeFor = (markdown: string): EnrichedNode => parseBlock(createBlocks([markdown])[0]);
const height = async (markdown: string, width = 800): Promise<number> =>
  (await layer.measureBlock(nodeFor(markdown), width)).dimensions.height;

describe("default-renderer measurement heuristics", () => {
  it("measures a bare <pre> as one base line per source line", async () => {
    expect(await height("```js\nfoo\nbar\n```")).toBe(48);
  });

  it("counts table rows from the tree, not from cell newlines", async () => {
    expect(await height("| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |")).toBe(3 * 28);
  });

  it("sums list items without phantom padding and collapses soft breaks", async () => {
    expect(await height("- a\n- b\n- c")).toBe(72);
    expect(await height("- first item\n  continues here\n- b")).toBe(48);
  });

  it("measures nested list items one indent deeper", async () => {
    const flat = await height("- aaaa\n- bbbb", 70);
    const nested = await height("- aaaa\n  - bbbb", 70);
    expect(flat).toBe(48);
    expect(nested).toBeGreaterThan(flat);
  });

  it("narrows blockquotes by their inset and adds no vertical padding", async () => {
    expect(await height("> quoted text")).toBe(24);
    // 20 characters fit in 200px (20 per line) but not in 200 - 19px.
    expect(await height(`> ${"x".repeat(20)}`, 200)).toBe(48);
  });

  it("reserves a line for an image-only paragraph", async () => {
    expect(await height("![alt](x.png)")).toBe(24);
  });

  it("compensates heading letter-spacing when wrapping", async () => {
    // h1 is 48px → 28.8px per character; 11 characters need 316.8px, but the
    // -0.04em tracking buys ~8.7% more room, so they fit on one line at 300px.
    expect(await height(`# ${"x".repeat(11)}`, 300)).toBe(51);
  });

  it("returns whole-pixel heights", async () => {
    expect(Number.isInteger(await height("# Title"))).toBe(true);
  });
});
