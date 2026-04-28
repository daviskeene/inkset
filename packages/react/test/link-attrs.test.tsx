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

describe("Inkset linkAttrs", () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

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
    globalThis.ResizeObserver = originalResizeObserver as typeof ResizeObserver;
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
  });

  it("applies attributes returned by linkAttrs to rendered markdown links", async () => {
    await act(async () => {
      root.render(
        <Inkset
          content="[External](https://example.com) and [Internal](/docs)"
          width={320}
          linkAttrs={(href) =>
            href.startsWith("https://")
              ? { target: "_blank", rel: "noopener noreferrer" }
              : undefined
          }
        />,
      );
    });
    await flushMicrotasks();

    const external = container.querySelector<HTMLAnchorElement>('a[href="https://example.com"]');
    const internal = container.querySelector<HTMLAnchorElement>('a[href="/docs"]');

    expect(external?.target).toBe("_blank");
    expect(external?.rel).toBe("noopener noreferrer");
    expect(internal?.target).toBe("");
    expect(internal?.rel).toBe("");
  });
});
