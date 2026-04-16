// Tests for heading metric tuples (Phase 3 theming). The critical guarantee is
// that default tuples produce the same block heights as the pre-Phase-3
// hardcoded values, so shipping the configurable API doesn't quietly shift
// every existing consumer's layout.
import { describe, it, expect } from "vitest";
import { MeasureLayer } from "../src/measure.js";
import type { EnrichedNode } from "../src/types.js";

const makeHeadingNode = (level: number, text: string): EnrichedNode => ({
  type: "element",
  tagName: `h${level}`,
  blockId: 0,
  blockType: "heading",
  children: [{ type: "text", value: text, blockId: 0, blockType: "heading" }],
});

describe("heading metric tuples", () => {
  it("defaults produce the same measurements as explicit pre-Phase-3 values", async () => {
    const defaultLayer = new MeasureLayer({
      font: "system-ui",
      fontSize: 16,
      lineHeight: 24,
    });
    const explicitLayer = new MeasureLayer({
      font: "system-ui",
      fontSize: 16,
      lineHeight: 24,
      headingSizes: [3, 2.15, 1.3, 1],
      headingWeights: [800, 780, 720, 680],
      headingLineHeights: [1.05, 1.08, 1.15, 1.2],
    });

    for (const level of [1, 2, 3, 4]) {
      const node = makeHeadingNode(level, "A heading of reasonable length for layout");
      const d1 = await defaultLayer.measureBlock(node, 600);
      const d2 = await explicitLayer.measureBlock(node, 600);
      expect(d2.dimensions).toEqual(d1.dimensions);
    }
  });

  it("h5 and h6 inherit h4 metrics", async () => {
    const layer = new MeasureLayer({ font: "system-ui", fontSize: 16, lineHeight: 24 });

    const h4 = await layer.measureBlock(makeHeadingNode(4, "Deep heading"), 600);
    const h5 = await layer.measureBlock(makeHeadingNode(5, "Deep heading"), 600);
    const h6 = await layer.measureBlock(makeHeadingNode(6, "Deep heading"), 600);

    expect(h5.dimensions).toEqual(h4.dimensions);
    expect(h6.dimensions).toEqual(h4.dimensions);
  });

  it("custom size tuples change the measured height", async () => {
    const small = new MeasureLayer({
      font: "system-ui",
      fontSize: 16,
      lineHeight: 24,
      headingSizes: [1.5, 1.3, 1.15, 1],
      headingLineHeights: [1.2, 1.2, 1.2, 1.2],
    });
    const big = new MeasureLayer({
      font: "system-ui",
      fontSize: 16,
      lineHeight: 24,
      headingSizes: [4, 3, 2, 1.5],
      headingLineHeights: [1.2, 1.2, 1.2, 1.2],
    });

    const node = makeHeadingNode(1, "A heading of reasonable length for layout");
    const smallDim = (await small.measureBlock(node, 600)).dimensions;
    const bigDim = (await big.measureBlock(node, 600)).dimensions;

    // Bigger font → either taller (wraps more in fallback) or at least
    // unequal. The exact ratio depends on whether pretext is available or
    // the char-width fallback runs, so we assert strict inequality rather
    // than a specific ratio.
    expect(bigDim.height).not.toBe(smallDim.height);
  });
});
