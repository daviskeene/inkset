// Smoke tests for createCodePlugin Phase 4 options. We don't exercise shiki
// here — the test runs in Node without canvas and without shiki wasm — so
// we verify the plugin shape and pluginData contract.
import { describe, it, expect } from "vitest";
import { createCodePlugin } from "../src/index.js";
import type { ASTNode, PluginContext } from "@inkset/core";

const makeCodeNode = (code: string, lang = "javascript"): ASTNode => ({
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
      children: [{ type: "text", value: code, blockId: 0, blockType: "code" }],
    },
  ],
});

const ctx: PluginContext = { containerWidth: 600, isStreaming: false };

describe("createCodePlugin", () => {
  it("defaults preserve pre-Phase-4 flags + theme=github-dark", () => {
    const plugin = createCodePlugin();
    const enriched = plugin.transform(makeCodeNode("const a = 1;"), ctx);
    expect(enriched.pluginData?.theme).toBe("github-dark");
    expect(enriched.pluginData?.lightTheme).toBeUndefined();
    expect(enriched.pluginData?.showHeader).toBe(true);
    expect(enriched.pluginData?.showCopy).toBe(true);
    expect(enriched.pluginData?.showLangLabel).toBe(true);
    expect(enriched.pluginData?.wrapLongLines).toBe(false);
  });

  it("options propagate", () => {
    const plugin = createCodePlugin({
      theme: "one-dark-pro",
      lightTheme: "github-light",
      showHeader: false,
      showCopy: false,
      showLangLabel: false,
      wrapLongLines: true,
    });
    const enriched = plugin.transform(makeCodeNode("x"), ctx);
    expect(enriched.pluginData?.theme).toBe("one-dark-pro");
    expect(enriched.pluginData?.lightTheme).toBe("github-light");
    expect(enriched.pluginData?.showHeader).toBe(false);
    expect(enriched.pluginData?.showCopy).toBe(false);
    expect(enriched.pluginData?.showLangLabel).toBe(false);
    expect(enriched.pluginData?.wrapLongLines).toBe(true);
  });

  it("measure drops header space when showHeader is off", () => {
    const withHeader = createCodePlugin({ showHeader: true });
    const withoutHeader = createCodePlugin({ showHeader: false });
    const code = "line1\nline2\nline3\nline4\nline5";
    const eWith = withHeader.transform(makeCodeNode(code), ctx);
    const eWithout = withoutHeader.transform(makeCodeNode(code), ctx);
    expect(withoutHeader.measure!(eWithout, 600).height).toBeLessThan(
      withHeader.measure!(eWith, 600).height,
    );
  });
});
