// Guards the streaming architecture: monotonic content growth during a stream
// must flow through appendToken (incremental, cache-preserving), not through
// setContent (full cold re-run of the document).
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamingPipeline } from "@inkset/core";
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

describe("Inkset incremental streaming", () => {
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

  it("feeds monotonic streamed growth through appendToken, not setContent", async () => {
    const setContentSpy = vi.spyOn(StreamingPipeline.prototype, "setContent");
    const appendSpy = vi.spyOn(StreamingPipeline.prototype, "appendToken");
    const endStreamSpy = vi.spyOn(StreamingPipeline.prototype, "endStream");

    await act(async () => {
      root.render(<Inkset content="Alpha" streaming width={320} />);
    });
    await settle();

    // Initial content submits as a streaming document (ingest stays open).
    expect(setContentSpy.mock.calls.length).toBeGreaterThan(0);
    for (const call of setContentSpy.mock.calls) {
      expect(call[1]).toEqual({ streaming: true });
    }
    const setContentCallsAfterMount = setContentSpy.mock.calls.length;

    await act(async () => {
      root.render(<Inkset content="Alpha beta" streaming width={320} />);
    });
    await settle();
    await act(async () => {
      root.render(<Inkset content="Alpha beta gamma" streaming width={320} />);
    });
    await settle();

    // Growth went through the incremental path only.
    expect(setContentSpy.mock.calls.length).toBe(setContentCallsAfterMount);
    expect(appendSpy.mock.calls.map((call) => call[0])).toEqual([" beta", " gamma"]);
    expect(container.textContent).toContain("Alpha beta gamma");

    // Settling flips the pipeline closed via endStream, again without a
    // full-document re-run.
    await act(async () => {
      root.render(<Inkset content="Alpha beta gamma" streaming={false} width={320} />);
    });
    await settle();

    expect(endStreamSpy).toHaveBeenCalled();
    expect(setContentSpy.mock.calls.length).toBe(setContentCallsAfterMount);
    expect(container.textContent).toContain("Alpha beta gamma");
  });

  it("appends the tail delta when content and streaming settle in the same render", async () => {
    const setContentSpy = vi.spyOn(StreamingPipeline.prototype, "setContent");
    const appendSpy = vi.spyOn(StreamingPipeline.prototype, "appendToken");

    await act(async () => {
      root.render(<Inkset content="Alpha" streaming width={320} />);
    });
    await settle();
    const setContentCallsAfterMount = setContentSpy.mock.calls.length;

    await act(async () => {
      root.render(<Inkset content="Alpha omega" streaming={false} width={320} />);
    });
    await settle();

    expect(setContentSpy.mock.calls.length).toBe(setContentCallsAfterMount);
    expect(appendSpy.mock.calls.map((call) => call[0])).toEqual([" omega"]);
    expect(container.textContent).toContain("Alpha omega");
  });

  it("falls back to a full replacement for non-monotonic content", async () => {
    const setContentSpy = vi.spyOn(StreamingPipeline.prototype, "setContent");

    await act(async () => {
      root.render(<Inkset content="Alpha beta" streaming width={320} />);
    });
    await settle();
    const setContentCallsAfterMount = setContentSpy.mock.calls.length;

    await act(async () => {
      root.render(<Inkset content="Rewritten" streaming width={320} />);
    });
    await settle();

    expect(setContentSpy.mock.calls.length).toBeGreaterThan(setContentCallsAfterMount);
    expect(container.textContent).toContain("Rewritten");
    expect(container.textContent).not.toContain("Alpha");
  });
});
