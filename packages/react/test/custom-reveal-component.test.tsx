import React, { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Inkset, type RevealComponentProps } from "../src/index.js";

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

describe("Inkset custom reveal components", () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined;

  beforeEach(() => {
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
    globalThis.ResizeObserver = originalResizeObserver as typeof ResizeObserver;
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("remounts the custom component for each fresh token in a continuing stream", async () => {
    const mountedTokens: string[] = [];

    function MountOnlyReveal({ token, children }: RevealComponentProps) {
      useEffect(() => {
        mountedTokens.push(token);
      }, [token]);

      return <span data-token={token}>{children}</span>;
    }

    const reveal = {
      throttle: false as const,
      animate: {
        preset: "fadeIn" as const,
        duration: 120,
        stagger: 30,
        sep: "word" as const,
      },
      component: MountOnlyReveal,
    };

    await act(async () => {
      root.render(
        <Inkset
          content="Alpha"
          streaming
          width={320}
          reveal={reveal}
        />,
      );
    });
    await flushMicrotasks();

    await act(async () => {
      root.render(
        <Inkset
          content="Alpha beta"
          streaming
          width={320}
          reveal={reveal}
        />,
      );
    });
    await flushMicrotasks();

    await act(async () => {
      root.render(
        <Inkset
          content="Alpha beta gamma"
          streaming
          width={320}
          reveal={reveal}
        />,
      );
    });
    await flushMicrotasks();

    expect(mountedTokens).toEqual(["Alpha", "beta", "gamma"]);
  });
});
