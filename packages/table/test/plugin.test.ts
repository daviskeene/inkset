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

describe("createTablePlugin audit fixes", () => {
  it("only claims blocks that actually contain a table", () => {
    const plugin = createTablePlugin();
    expect(plugin.canHandle?.(makeTableNode())).toBe(true);
    const paragraph: ASTNode = {
      type: "element",
      tagName: "p",
      blockId: 0,
      blockType: "table",
      children: [{ type: "text", value: "|not a table", blockId: 0, blockType: "table" }],
    };
    expect(plugin.canHandle?.(paragraph)).toBe(false);
  });

  it("measures the toolbar, header row and body rows like the stylesheet", () => {
    const plugin = createTablePlugin();
    const enriched = plugin.transform(makeTableNode(), ctx);
    const rows = ((enriched.pluginData?.html as string).match(/<tr/g) ?? []).length;
    expect(plugin.measure?.(enriched, 600)).toEqual({
      width: 600,
      height: Math.max(24 + 39 + (rows - 1) * 45, 64),
    });
    const noCopy = createTablePlugin({ showCopy: false });
    expect(noCopy.measure?.(noCopy.transform(makeTableNode(), ctx), 600).height).toBe(
      Math.max(39 + (rows - 1) * 45, 64),
    );
  });
});
