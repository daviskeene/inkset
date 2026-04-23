// Smoke tests for createMathPlugin Phase 4 options.
import { describe, it, expect } from "vitest";
import { createMathPlugin } from "../src/index.js";
import type { ASTNode, PluginContext } from "@inkset/core";

const makeMathNode = (latex: string): ASTNode => ({
  type: "element",
  tagName: "div",
  blockId: 0,
  blockType: "math-display",
  children: [{ type: "text", value: `$$${latex}$$`, blockId: 0, blockType: "math-display" }],
});

const ctx: PluginContext = { containerWidth: 600, isStreaming: false };

describe("createMathPlugin", () => {
  it("defaults set displayAlign=center and errorDisplay=source", () => {
    const plugin = createMathPlugin();
    const enriched = plugin.transform(makeMathNode("x^2 + y^2 = z^2"), ctx);
    expect(enriched.pluginData?.displayAlign).toBe("center");
    expect(enriched.pluginData?.errorDisplay).toBe("source");
    expect(enriched.pluginData?.displayMode).toBe(true);
  });

  it("options propagate to pluginData", () => {
    const plugin = createMathPlugin({ displayAlign: "left", errorDisplay: "message" });
    const enriched = plugin.transform(makeMathNode("a"), ctx);
    expect(enriched.pluginData?.displayAlign).toBe("left");
    expect(enriched.pluginData?.errorDisplay).toBe("message");
  });

  it("strips $$ fences from latex", () => {
    const plugin = createMathPlugin();
    const enriched = plugin.transform(makeMathNode("E = mc^2"), ctx);
    expect(enriched.pluginData?.latex).toBe("E = mc^2");
  });

  it("preserves bare \\begin{env}...\\end{env} without $$ wrapping", () => {
    const plugin = createMathPlugin();
    const raw = "\\begin{equation}\nx + y = 1\n\\end{equation}";
    const node: ASTNode = {
      type: "element",
      tagName: "div",
      blockId: 0,
      blockType: "math-display",
      children: [{ type: "text", value: raw, blockId: 0, blockType: "math-display" }],
    };
    const enriched = plugin.transform(node, ctx);
    expect(enriched.pluginData?.latex).toContain("\\begin{equation}");
    expect(enriched.pluginData?.latex).toContain("\\end{equation}");
  });

  it("strips \\label{...} before KaTeX sees it", () => {
    const plugin = createMathPlugin();
    const enriched = plugin.transform(
      makeMathNode("\\begin{equation}\\label{eq:foo} x = 1 \\end{equation}"),
      ctx,
    );
    expect(enriched.pluginData?.latex).not.toContain("\\label");
    expect(enriched.pluginData?.latex).not.toContain("eq:foo");
  });

  it("replaces \\eqref{...} with a placeholder inside math", () => {
    const plugin = createMathPlugin();
    const enriched = plugin.transform(
      makeMathNode("a = \\eqref{eq:foo} + 1"),
      ctx,
    );
    expect(enriched.pluginData?.latex).not.toContain("\\eqref");
    expect(enriched.pluginData?.latex).toContain("(?)");
  });
});
