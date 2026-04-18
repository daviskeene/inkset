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

const waitFor = async (predicate: () => boolean, message: string): Promise<void> => {
  for (let i = 0; i < 20; i++) {
    if (predicate()) return;
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    await flushMicrotasks();
  }
  throw new Error(message);
};

describe("Inkset reveal session", () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

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

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const width = Number.parseInt((this as HTMLElement).style.width || "0", 10) || 320;
      const height = Number.parseInt((this as HTMLElement).style.minHeight || "24", 10) || 24;
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: height,
        right: width,
        width,
        height,
        toJSON() {
          return this;
        },
      } as DOMRect;
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
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("drops reveal mode once a throttled stream has fully drained", async () => {
    const content = "Alpha beta gamma delta";

    await act(async () => {
      root.render(
        <Inkset
          content={content}
          streaming
          width={320}
          reveal={{}}
        />,
      );
    });
    await flushMicrotasks();

    const getRoot = (): HTMLElement => {
      const node = container.querySelector<HTMLElement>(".inkset-root");
      expect(node).not.toBeNull();
      return node!;
    };

    await waitFor(
      () => getRoot().hasAttribute("data-inkset-reveal"),
      "expected reveal mode to be active while streaming",
    );

    await act(async () => {
      vi.advanceTimersByTime(30);
    });
    await flushMicrotasks();

    await act(async () => {
      root.render(
        <Inkset
          content={content}
          streaming={false}
          width={320}
          reveal={{}}
        />,
      );
    });
    await flushMicrotasks();

    await waitFor(
      () => !getRoot().hasAttribute("data-inkset-reveal"),
      "expected reveal mode to turn off after the stream settled",
    );

    expect(container.querySelector("[data-inkset-reveal-token]")).toBeNull();
    expect(container.querySelector(".inkset-aria-mirror")).toBeNull();
    expect(getRoot().getAttribute("aria-hidden")).toBeNull();
  });
});
