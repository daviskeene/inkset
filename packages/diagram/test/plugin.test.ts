// Smoke tests for createDiagramPlugin. Mermaid can't run in Node (requires
// a real DOM), so we test the plumbing: lang-scoped canHandle, transform
// pluginData contract, measure output, and the option-driven `key`.
import { describe, it, expect } from "vitest";
import { createDiagramPlugin } from "../src/index.js";
import type { ASTNode, PluginContext } from "@inkset/core";

const makeCodeNode = (lang: string, source: string): ASTNode => ({
  type: "element",
  tagName: "pre",
  blockId: 0,
  blockType: "code",
  lang,
  children: [
    {
      type: "element",
      tagName: "code",
      blockId: 0,
      blockType: "code",
      properties: { className: [`language-${lang}`] },
      children: [{ type: "text", value: source, blockId: 0, blockType: "code" }],
    },
  ],
});

const ctx: PluginContext = { containerWidth: 600, isStreaming: false };

describe("createDiagramPlugin", () => {
  it("canHandle claims mermaid blocks and declines others", () => {
    const plugin = createDiagramPlugin();
    expect(plugin.canHandle!(makeCodeNode("mermaid", "graph TD\nA-->B"))).toBe(true);
    expect(plugin.canHandle!(makeCodeNode("typescript", "const x = 1;"))).toBe(false);
    expect(plugin.canHandle!(makeCodeNode("", ""))).toBe(false);
  });

  it("canHandle falls back to className when node.lang is missing", () => {
    const plugin = createDiagramPlugin();
    const node: ASTNode = {
      type: "element",
      tagName: "pre",
      blockId: 0,
      blockType: "code",
      children: [
        {
          type: "element",
          tagName: "code",
          blockId: 0,
          blockType: "code",
          properties: { className: ["language-mermaid"] },
          children: [{ type: "text", value: "graph TD\nA-->B", blockId: 0, blockType: "code" }],
        },
      ],
    };
    // Wrap the code in a pre → code structure that detectLanguage walks.
    const preNode: ASTNode = {
      type: "element",
      tagName: "div",
      blockId: 0,
      blockType: "code",
      children: [node],
    };
    expect(plugin.canHandle!(preNode)).toBe(true);
  });

  it("transform extracts source and populates pluginData", () => {
    const plugin = createDiagramPlugin({ theme: "neutral", showCopy: false });
    const enriched = plugin.transform(makeCodeNode("mermaid", "graph TD\nA-->B"), ctx);
    expect(enriched.pluginData?.source).toBe("graph TD\nA-->B");
    expect(enriched.pluginData?.theme).toBe("neutral");
    expect(enriched.pluginData?.showCopy).toBe(false);
    expect(enriched.pluginData?.showHeader).toBe(true);
    expect(enriched.transformedBy).toBe("diagram");
  });

  it("custom language option swaps the canHandle gate", () => {
    const plugin = createDiagramPlugin({ language: "graphviz" });
    expect(plugin.canHandle!(makeCodeNode("graphviz", "digraph{}"))).toBe(true);
    expect(plugin.canHandle!(makeCodeNode("mermaid", "graph TD"))).toBe(false);
  });

  it("measure scales with line count within clamped bounds", () => {
    const plugin = createDiagramPlugin();
    const oneLiner = plugin.transform(makeCodeNode("mermaid", "graph TD\nA-->B"), ctx);
    const longDiagram = plugin.transform(
      makeCodeNode(
        "mermaid",
        Array.from({ length: 40 }, (_, i) => `  N${i}-->N${i + 1}`).join("\n"),
      ),
      ctx,
    );
    const small = plugin.measure!(oneLiner, 600);
    const big = plugin.measure!(longDiagram, 600);
    expect(small.height).toBeGreaterThanOrEqual(160);
    expect(big.height).toBeLessThanOrEqual(600);
    expect(big.height).toBeGreaterThanOrEqual(small.height);
  });

  it("key changes when options change so the pipeline rebuilds", () => {
    const a = createDiagramPlugin({ theme: "dark" });
    const b = createDiagramPlugin({ theme: "neutral" });
    const c = createDiagramPlugin({ theme: "dark", showCopy: false });
    expect(a.key).not.toBe(b.key);
    expect(a.key).not.toBe(c.key);
  });
});
