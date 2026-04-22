import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDiagramPlugin } from "../src/index.js";
import type { ASTNode, PluginContext } from "@inkset/core";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({
      svg: '<svg width="120" height="80" viewBox="0 0 120 80"><rect width="120" height="80" /></svg>',
    })),
  },
}));

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

const flushEffects = async (): Promise<void> => {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

describe("diagram component", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
  });

  it("notifies the host after the svg settles", async () => {
    const plugin = createDiagramPlugin();
    const node = plugin.transform(makeCodeNode("mermaid", "graph TD\nA[Start] --> B[Stop]"), ctx);
    const Component = plugin.component;
    const onContentSettled = vi.fn();

    await act(async () => {
      root.render(
        <Component node={node} isStreaming={false} onContentSettled={onContentSettled} />,
      );
    });

    await flushEffects();

    expect(container.querySelector("svg")).not.toBeNull();
    expect(onContentSettled).toHaveBeenCalled();
  });
});
