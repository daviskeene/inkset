// Tests for the layout layer: vertical stacking, height calculation, and viewport filtering.
import { describe, it, expect } from "vitest";
import { computeLayout, getLayoutHeight, getVisibleBlocks } from "../src/layout.js";
import type { MeasuredBlock, EnrichedNode } from "../src/types.js";

const makeNode = (blockId: number): EnrichedNode => {
  return {
    type: "element",
    tagName: "p",
    blockId,
    blockType: "paragraph",
    children: [{ type: "text", value: `Block ${blockId}`, blockId, blockType: "paragraph" }],
  };
};

const makeMeasured = (blockId: number, height: number): MeasuredBlock => {
  return {
    blockId,
    node: makeNode(blockId),
    dimensions: { width: 800, height },
  };
};

describe("computeLayout", () => {
  it("returns empty array for no blocks", () => {
    expect(computeLayout([])).toEqual([]);
  });

  it("returns empty array for zero-width container", () => {
    expect(computeLayout([makeMeasured(0, 24)], { containerWidth: 0 })).toEqual([]);
  });

  it("stacks blocks vertically with margins", () => {
    const blocks = [makeMeasured(0, 24), makeMeasured(1, 48), makeMeasured(2, 24)];
    const layout = computeLayout(blocks, { containerWidth: 800, blockMargin: 16 });

    expect(layout).toHaveLength(3);
    expect(layout[0].y).toBe(0);
    expect(layout[0].height).toBe(24);
    expect(layout[1].y).toBe(24 + 16); // first height + margin
    expect(layout[1].height).toBe(48);
    expect(layout[2].y).toBe(24 + 16 + 48 + 16); // cumulative
  });

  it("respects padding", () => {
    const blocks = [makeMeasured(0, 24)];
    const layout = computeLayout(blocks, {
      containerWidth: 800,
      blockMargin: 16,
      padding: 20,
    });

    expect(layout[0].x).toBe(20);
    expect(layout[0].y).toBe(20);
    expect(layout[0].width).toBe(760); // 800 - 2*20
  });

  it("limits block width to container", () => {
    const blocks: MeasuredBlock[] = [{
      blockId: 0,
      node: makeNode(0),
      dimensions: { width: 1200, height: 24 }, // wider than container
    }];
    const layout = computeLayout(blocks, { containerWidth: 800 });
    expect(layout[0].width).toBe(800);
  });

  it("preserves block IDs", () => {
    const blocks = [makeMeasured(5, 24), makeMeasured(10, 24)];
    const layout = computeLayout(blocks);
    expect(layout[0].blockId).toBe(5);
    expect(layout[1].blockId).toBe(10);
  });
});

describe("getLayoutHeight", () => {
  it("returns 0 for empty layout", () => {
    expect(getLayoutHeight([])).toBe(0);
  });

  it("returns last block bottom edge", () => {
    const layout = computeLayout(
      [makeMeasured(0, 24), makeMeasured(1, 48)],
      { containerWidth: 800, blockMargin: 16 },
    );
    expect(getLayoutHeight(layout)).toBe(24 + 16 + 48);
  });

  it("adds padding to height", () => {
    const layout = computeLayout([makeMeasured(0, 24)], { containerWidth: 800 });
    expect(getLayoutHeight(layout, 20)).toBe(24 + 20);
  });
});

describe("getVisibleBlocks", () => {
  it("returns blocks within viewport", () => {
    const blocks = [
      makeMeasured(0, 100),
      makeMeasured(1, 100),
      makeMeasured(2, 100),
      makeMeasured(3, 100),
    ];
    const layout = computeLayout(blocks, { containerWidth: 800, blockMargin: 0 });

    // Viewport from 150 to 350 should see blocks 1 and 2
    const visible = getVisibleBlocks(layout, 150, 200);
    expect(visible.map((b) => b.blockId)).toEqual([1, 2, 3]);
  });

  it("returns empty for scroll past all blocks", () => {
    const layout = computeLayout([makeMeasured(0, 100)], { containerWidth: 800 });
    expect(getVisibleBlocks(layout, 500, 200)).toEqual([]);
  });

  it("includes partially visible blocks", () => {
    const layout = computeLayout(
      [makeMeasured(0, 100), makeMeasured(1, 100)],
      { containerWidth: 800, blockMargin: 0 },
    );
    // Block 0 ends at y=100, viewport starts at y=50 — block 0 is partially visible
    const visible = getVisibleBlocks(layout, 50, 100);
    expect(visible.map((b) => b.blockId)).toEqual([0, 1]);
  });
});

describe("layout performance", () => {
  it("handles 1000 blocks in under 5ms", () => {
    const blocks = Array.from({ length: 1000 }, (_, i) => makeMeasured(i, 24));

    const start = performance.now();
    const layout = computeLayout(blocks, { containerWidth: 800, blockMargin: 16 });
    const elapsed = performance.now() - start;

    expect(layout).toHaveLength(1000);
    expect(elapsed).toBeLessThan(5);
  });
});
