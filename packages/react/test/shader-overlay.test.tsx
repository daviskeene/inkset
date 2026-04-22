import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShaderRegistry, type ShaderPreset, type ShaderToken } from "@inkset/animate";
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
  for (let i = 0; i < 20; i += 1) {
    if (predicate()) return;
    await flushMicrotasks();
  }
  throw new Error(message);
};

describe("Inkset shader overlay", () => {
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
        setTransform() {},
        clearRect() {},
        fillRect() {},
        beginPath() {},
        roundRect() {},
        fill() {},
        save() {},
        restore() {},
        translate() {},
        scale() {},
        filter: "none",
        fillStyle: "",
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

  it("queues and emits fresh token rects to the shader instance", async () => {
    const emittedBatches: ShaderToken[][] = [];
    const shaderName = "unit-test-react-shader";

    const preset: ShaderPreset = {
      name: shaderName,
      async init() {
        return {
          emit(tokens) {
            emittedBatches.push(tokens.map((token) => ({ ...token })));
          },
          dispose() {},
        };
      },
    };

    const shaderRegistry = createShaderRegistry();
    shaderRegistry.register(shaderName, async () => preset);

    const reveal = {
      throttle: false as const,
      timeline: {
        durationMs: 120,
        stagger: 30,
        sep: "word" as const,
      },
      css: false as const,
      shader: { source: shaderName },
    };

    await act(async () => {
      root.render(
        <Inkset
          content="Alpha beta"
          streaming
          width={320}
          reveal={reveal}
          shaderRegistry={shaderRegistry}
        />,
      );
    });
    await flushMicrotasks();
    await waitFor(
      () => emittedBatches.length >= 1,
      "expected the shader to receive the initial fresh token batch",
    );

    await act(async () => {
      root.render(
        <Inkset
          content="Alpha beta gamma"
          streaming
          width={320}
          reveal={reveal}
          shaderRegistry={shaderRegistry}
        />,
      );
    });
    await flushMicrotasks();
    await waitFor(
      () => emittedBatches.length >= 2,
      "expected the shader to receive the appended token batch",
    );

    expect(emittedBatches[0]?.map((token) => token.tokenIndex)).toEqual([0, 1]);
    expect(emittedBatches[0]?.every((token) => token.width > 0 && token.height > 0)).toBe(true);
    expect(emittedBatches[1]?.map((token) => token.tokenIndex)).toEqual([0]);
    expect(emittedBatches[1]?.[0]?.tickId).toBeGreaterThan(emittedBatches[0]?.[0]?.tickId ?? -1);

    const overlay = container.querySelector<HTMLCanvasElement>("[data-inkset-shader-overlay]");
    expect(overlay).not.toBeNull();
    expect(overlay?.style.zIndex).toBe("2");
  });

  it("preserves shader token batches across same-tick rerenders", async () => {
    const emittedBatches: ShaderToken[][] = [];

    const preset: ShaderPreset = {
      name: "unit-test-react-shader-rerender",
      async init() {
        return {
          emit(tokens) {
            emittedBatches.push(tokens.map((token) => ({ ...token })));
          },
          dispose() {},
        };
      },
    };

    const reveal = {
      throttle: false as const,
      timeline: {
        durationMs: 120,
        stagger: 30,
        sep: "word" as const,
      },
      css: false as const,
      shader: { source: preset },
    };

    await act(async () => {
      root.render(<Inkset content="Alpha beta" streaming width={320} reveal={reveal} />);

      // Force a same-tick rerender before effects flush. The wrapped reveal
      // tree will be reused from the cache; the shader batch still needs to
      // be reconstructed from that cached tree so the initial words get the
      // overlay.
      root.render(<Inkset content="Alpha beta" streaming width={300} reveal={reveal} />);
    });

    await flushMicrotasks();
    await waitFor(
      () => emittedBatches.length >= 1,
      "expected the shader to receive the initial batch after a same-tick rerender",
    );

    expect(emittedBatches[0]?.map((token) => token.tokenIndex)).toEqual([0, 1]);
    expect(emittedBatches[0]?.every((token) => token.width > 0 && token.height > 0)).toBe(true);
  });

  it("uses inline token display for the dither preset to avoid line-wrap jitter", async () => {
    await act(async () => {
      root.render(
        <Inkset
          content="Alpha beta gamma"
          streaming
          width={320}
          reveal={{
            throttle: false,
            timeline: { durationMs: 120, stagger: 30, sep: "word" },
            css: { preset: "pg-reveal-dither-in" },
          }}
        />,
      );
    });
    await flushMicrotasks();

    const inksetRoot = container.querySelector<HTMLElement>(".inkset-root");
    expect(inksetRoot).not.toBeNull();
    expect(inksetRoot?.style.getPropertyValue("--inkset-reveal-display")).toBe("inline");
  });
});
