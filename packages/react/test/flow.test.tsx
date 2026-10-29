// Guards `<Inkset flow>`: every block in document flow with no fixed width, so
// a container that sizes itself to its content (a chat bubble) can do so.
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Inkset } from "../src/index.js";

class MockResizeObserver {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    await act(async () => {
      await Promise.resolve();
    });
  }
};

describe("flow", () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      return {
        font: "",
        measureText(text: string) {
          return {
            width: text.length * 8,
            actualBoundingBoxLeft: 0,
            actualBoundingBoxRight: text.length * 8,
            actualBoundingBoxAscent: 8,
            actualBoundingBoxDescent: 4,
          };
        },
      } as unknown as CanvasRenderingContext2D;
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
    globalThis.ResizeObserver = originalResizeObserver as typeof ResizeObserver;
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
  });

  it("renders blocks in flow with layout gaps, even in an unsized container", async () => {
    await act(async () => {
      root.render(
        <Inkset
          content={"First paragraph.\n\nSecond paragraph."}
          flow
          blockSpacing={{ default: 10 }}
        />,
      );
    });
    await settle();

    const blocks = [...container.querySelectorAll<HTMLElement>(".inkset-root > [data-block-id]")];
    expect(blocks.map((block) => block.textContent)).toEqual([
      "First paragraph.",
      "Second paragraph.",
    ]);
    for (const block of blocks) {
      expect(block.style.position).toBe("");
      expect(block.style.width).toBe("");
    }
    expect(blocks[1].style.marginTop).toBe("10px");
    expect(container.querySelector<HTMLElement>(".inkset-root")?.style.minHeight).toBe("");
  });

  // Regression: the gap went on the empty block and again on the next one.
  it("gives a zero-height block no gap", async () => {
    await act(async () => {
      root.render(
        <Inkset
          content={"First paragraph.\n\n<!-- a note -->\n\nSecond paragraph."}
          flow
          blockSpacing={{ default: 10 }}
        />,
      );
    });
    await settle();

    const blocks = [...container.querySelectorAll<HTMLElement>(".inkset-root > [data-block-id]")];
    expect(blocks).toHaveLength(3);
    expect(blocks[1].style.marginTop).toBe("0px");
    expect(blocks[2].style.marginTop).toBe("10px");
  });

  // Regression: measurement used the h4 tracking value but the h4-h6 rule never applied it.
  it("applies heading 4 tracking in the stylesheet", async () => {
    await act(async () => {
      root.render(<Inkset content="#### A small heading" flow />);
    });
    await settle();

    const css = container.querySelector(".inkset-root > style")?.textContent ?? "";
    expect(css).toMatch(/h6\)\s*\{[^}]*letter-spacing: var\(--inkset-heading-4-tracking\)/);
  });
});
