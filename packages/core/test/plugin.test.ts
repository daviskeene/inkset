// Tests for the plugin registry: registration, handler dispatch, and error handling.
import { describe, it, expect, vi } from "vitest";
import { PluginRegistry } from "../src/plugin.js";
import type { PreframePlugin, ASTNode, BlockType, PluginContext } from "../src/types.js";

const makePlugin = (name: string, handles: string[]): PreframePlugin => {
  return {
    name,
    handles,
    transform: (node) => ({ ...node, transformedBy: name, pluginData: { by: name } }),
    component: () => null,
  };
};

const makeNode = (blockType: BlockType, blockId = 0): ASTNode => {
  return {
    type: "element",
    tagName: "div",
    blockId,
    blockType,
  };
};

const ctx: PluginContext = { containerWidth: 800, isStreaming: false };

describe("PluginRegistry", () => {
  it("registers and retrieves plugins", () => {
    const registry = new PluginRegistry();
    const plugin = makePlugin("test", ["code"]);
    registry.register(plugin);

    expect(registry.get("test")).toBe(plugin);
    expect(registry.all()).toHaveLength(1);
  });

  it("looks up handlers by node type", () => {
    const registry = new PluginRegistry();
    const codePlugin = makePlugin("code", ["code"]);
    const mathPlugin = makePlugin("math", ["math-display"]);

    registry.register(codePlugin);
    registry.register(mathPlugin);

    expect(registry.getHandlers("code")).toEqual([codePlugin]);
    expect(registry.getHandlers("math-display")).toEqual([mathPlugin]);
    expect(registry.getHandlers("paragraph")).toEqual([]);
  });

  it("supports multiple handlers for same type", () => {
    const registry = new PluginRegistry();
    registry.register(makePlugin("highlighter", ["code"]));
    registry.register(makePlugin("line-numbers", ["code"]));

    expect(registry.getHandlers("code")).toHaveLength(2);
  });

  it("replaces plugin on re-register", () => {
    const registry = new PluginRegistry();
    registry.register(makePlugin("test", ["code"]));
    registry.register(makePlugin("test", ["code", "math-display"]));

    expect(registry.all()).toHaveLength(1);
    expect(registry.getHandlers("math-display")).toHaveLength(1);
  });

  it("transforms nodes through matching plugins", () => {
    const registry = new PluginRegistry();
    registry.register(makePlugin("code-hl", ["code"]));

    const node = makeNode("code");
    const result = registry.transform(node, ctx);

    expect(result.transformedBy).toBe("code-hl");
    expect(result.pluginData).toEqual({ by: "code-hl" });
  });

  it("returns untransformed node when no plugins match", () => {
    const registry = new PluginRegistry();
    const node = makeNode("paragraph");
    const result = registry.transform(node, ctx);

    expect(result).toEqual(node);
  });

  it("handles plugin transform errors gracefully", () => {
    const registry = new PluginRegistry();
    const broken: PreframePlugin = {
      name: "broken",
      handles: ["code"],
      transform: () => { throw new Error("plugin crash"); },
      component: () => null,
    };
    registry.register(broken);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const node = makeNode("code");
    const result = registry.transform(node, ctx);

    expect(result.blockId).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("identifies width-sensitive plugins", () => {
    const registry = new PluginRegistry();
    const normal = makePlugin("normal", ["paragraph"]);
    const adaptive: PreframePlugin = {
      ...makePlugin("adaptive", ["code"]),
      widthSensitive: true,
    };

    registry.register(normal);
    registry.register(adaptive);

    expect(registry.widthSensitive()).toEqual([adaptive]);
  });

  it("clears all plugins", () => {
    const registry = new PluginRegistry();
    registry.register(makePlugin("a", ["code"]));
    registry.register(makePlugin("b", ["math-display"]));
    registry.clear();

    expect(registry.all()).toHaveLength(0);
    expect(registry.getHandlers("code")).toEqual([]);
  });
});
