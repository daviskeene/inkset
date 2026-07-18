// Integration test: exercises <Inkset> exactly like a first-time consumer —
// zero plugins, zero config, streamed mixed-markdown content.
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

const flushMicrotasks = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
  });
};

const settle = async (): Promise<void> => {
  // Let rAF-scheduled pipeline runs and deferred height flushes drain.
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    await flushMicrotasks();
  }
};

const DOC_STEPS = [
  "# Hello\n\nThis is the fir",
  "# Hello\n\nThis is the first paragraph.\n\n- item one\n- item ",
  "# Hello\n\nThis is the first paragraph.\n\n- item one\n- item two\n\n```js\nconst x = 1",
  "# Hello\n\nThis is the first paragraph.\n\n- item one\n- item two\n\n```js\nconst x = 1;\n```\n\nDone.",
];

describe("smoke: <Inkset> zero-config integration", () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined;
  let consoleErrors: unknown[][];

  beforeEach(() => {
    vi.useFakeTimers();
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

    consoleErrors = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args);
    });

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      return {
        font: "",
        measureText(text: string) {
          const width = text.length * 8;
          return {
            width,
            actualBoundingBoxLeft: 0,
            actualBoundingBoxRight: width,
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

  it("renders a streamed conversation with zero plugins and zero config", async () => {
    for (const step of DOC_STEPS) {
      await act(async () => {
        root.render(<Inkset content={step} streaming width={480} />);
      });
      await settle();
    }

    await act(async () => {
      root.render(
        <Inkset content={DOC_STEPS[DOC_STEPS.length - 1]} streaming={false} width={480} />,
      );
    });
    await settle();

    const rootEl = container.querySelector<HTMLElement>(".inkset-root");
    expect(rootEl).not.toBeNull();

    // Everything a default (pluginless) install should show.
    expect(container.querySelector("h1")?.textContent).toBe("Hello");
    expect(container.textContent).toContain("This is the first paragraph.");
    expect(container.querySelectorAll("li").length).toBe(2);
    // Code block falls back to a plain <pre><code> without @inkset/code.
    expect(container.querySelector("pre code")?.textContent).toContain("const x = 1;");
    expect(container.textContent).toContain("Done.");

    // Blocks are laid out: frozen blocks absolute, none overlapping at y=0 twice.
    const blocks = container.querySelectorAll("[data-block-id]");
    expect(blocks.length).toBe(5);

    const reactErrors = consoleErrors.filter(
      (args) => typeof args[0] === "string" && !args[0].includes("not wrapped in act"),
    );
    expect(reactErrors).toEqual([]);
  });

  it("mid-stream unclosed markdown renders repaired, not broken", async () => {
    await act(async () => {
      root.render(<Inkset content={"Some **bold text that has not clo"} streaming width={480} />);
    });
    await settle();

    // Repair should close the bold run so a <strong> exists mid-stream.
    expect(container.querySelector("strong")?.textContent).toContain("bold text");
  });
});
