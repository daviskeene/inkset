// Smoke tests for createTablePlugin. The assertion is that default options
// reproduce pre-Phase-4 pluginData and that each option surfaces on the
// enriched node where the renderer expects it.
import { describe, it, expect } from "vitest";
import { createTablePlugin } from "../src/index.js";
import type { ASTNode, PluginContext } from "@inkset/core";

const makeTableNode = (): ASTNode => ({
  type: "element",
  tagName: "table",
  blockId: 0,
  blockType: "table",
  children: [
    {
      type: "element",
      tagName: "tbody",
      blockId: 0,
      blockType: "table",
      children: [
        {
          type: "element",
          tagName: "tr",
          blockId: 0,
          blockType: "table",
          children: [
            {
              type: "element",
              tagName: "td",
              blockId: 0,
              blockType: "table",
              children: [{ type: "text", value: "A", blockId: 0, blockType: "table" }],
            },
          ],
        },
      ],
    },
  ],
});

const ctx: PluginContext = { containerWidth: 600, isStreaming: false };

describe("createTablePlugin", () => {
  it("default options set showCopy=true, borderStyle=horizontal, zebra=false, stickyHeader=false", () => {
    const plugin = createTablePlugin();
    const enriched = plugin.transform(makeTableNode(), ctx);
    expect(enriched.pluginData?.showCopy).toBe(true);
    expect(enriched.pluginData?.borderStyle).toBe("horizontal");
    expect(enriched.pluginData?.zebra).toBe(false);
    expect(enriched.pluginData?.stickyHeader).toBe(false);
  });

  it("options propagate to pluginData", () => {
    const plugin = createTablePlugin({
      showCopy: false,
      borderStyle: "all",
      zebra: true,
      stickyHeader: true,
    });
    const enriched = plugin.transform(makeTableNode(), ctx);
    expect(enriched.pluginData?.showCopy).toBe(false);
    expect(enriched.pluginData?.borderStyle).toBe("all");
    expect(enriched.pluginData?.zebra).toBe(true);
    expect(enriched.pluginData?.stickyHeader).toBe(true);
  });

  it("measure reserves no header space when showCopy is off", () => {
    const withCopy = createTablePlugin({ showCopy: true });
    const withoutCopy = createTablePlugin({ showCopy: false });
    const enrichedWith = withCopy.transform(makeTableNode(), ctx);
    const enrichedWithout = withoutCopy.transform(makeTableNode(), ctx);
    const withHeight = withCopy.measure!(enrichedWith, 600).height;
    const withoutHeight = withoutCopy.measure!(enrichedWithout, 600).height;
    expect(withoutHeight).toBeLessThanOrEqual(withHeight);
  });

  it("transform still emits html and csv", () => {
    const plugin = createTablePlugin();
    const enriched = plugin.transform(makeTableNode(), ctx);
    expect(typeof enriched.pluginData?.html).toBe("string");
    expect(typeof enriched.pluginData?.csv).toBe("string");
  });
});
