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
    vi.useRealTimers();
    globalThis.ResizeObserver = originalResizeObserver as typeof ResizeObserver;
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
  });

  it("drops reveal mode once a throttled stream has fully drained", async () => {
    const content = "Alpha beta gamma delta";

    await act(async () => {
      root.render(<Inkset content={content} streaming width={320} reveal={{}} />);
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
      root.render(<Inkset content={content} streaming={false} width={320} reveal={{}} />);
    });
    await flushMicrotasks();

    // Drain + post-drain hold (timeline.durationMs + maxSpanMs). Use the
    // async advance so microtasks drain between timer ticks — without it the
    // gate's .finally that schedules the hold timer queues after the sync
    // advance completes and the hold never fires within the window.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
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

  it("wraps tail tokens when a throttled + animated stream drains", async () => {
    // Regression: without the post-drain hold, the last setDisplayedContent
    // and setRevealDrainActive(false) batched into one render where session
    // was already false, the wrap pass skipped, and the tail tokens landed
    // as plain text with no blur-in animation.
    const partial = "Alpha beta";
    const full = "Alpha beta gamma delta";
    const reveal = {
      throttle: { delayInMs: 10, chunking: "word" as const },
      timeline: { durationMs: 120, stagger: 10 },
      css: { preset: "blurIn" as const },
    };

    await act(async () => {
      root.render(<Inkset content={partial} streaming width={320} reveal={reveal} />);
    });
    await flushMicrotasks();
    await act(async () => {
      vi.advanceTimersByTime(120);
    });
    await flushMicrotasks();

    // Switch to settled state with the tail appended. The gate drains the
    // delta through the pipeline.
    await act(async () => {
      root.render(<Inkset content={full} streaming={false} width={320} reveal={reveal} />);
    });
    await flushMicrotasks();

    // Advance through the gate's drain cadence so all chunks emit. Async
    // variant drains microtasks (notably the flush().finally that schedules
    // the post-drain hold) between timer ticks.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await flushMicrotasks();

    // The wrap is delta-aware: only the tokens produced during the current
    // tick carry data-inkset-reveal-token. Previously-wrapped tokens revert
    // to plain text on subsequent ticks after their animation fires. So the
    // LAST emitted token ("delta") is what survives at the end of drain —
    // which is exactly the one the bug used to drop. Before the fix, the
    // final emit and setRevealDrainActive(false) batched into one render
    // where the session had already closed, the wrap pass skipped, and
    // "delta" rendered as plain text with no blur-in.
    const tokenTexts = Array.from(
      container.querySelectorAll<HTMLElement>("[data-inkset-reveal-token]"),
    ).map((el) => el.textContent ?? "");
    expect(tokenTexts).toContain("delta");

    // Root must still advertise reveal mode inside the hold window so the
    // CSS keyframes can play out.
    const rootEl = container.querySelector<HTMLElement>(".inkset-root");
    expect(rootEl?.hasAttribute("data-inkset-reveal")).toBe(true);
  });

  it("remounts reveal spans for successive words in one long text run", async () => {
    const reveal = {
      throttle: false as const,
      timeline: { durationMs: 120, stagger: 10 },
      css: { preset: "blurIn" as const },
    };

    await act(async () => {
      root.render(<Inkset content="Alpha " streaming width={320} reveal={reveal} />);
    });
    await flushMicrotasks();

    const firstSpan = container.querySelector<HTMLElement>("[data-inkset-reveal-token]");
    expect(firstSpan?.textContent).toBe("Alpha");

    await act(async () => {
      root.render(<Inkset content="Alpha beta " streaming width={320} reveal={reveal} />);
    });
    await flushMicrotasks();

    const secondSpan = container.querySelector<HTMLElement>("[data-inkset-reveal-token]");
    expect(secondSpan?.textContent).toBe("beta");
    expect(secondSpan).not.toBe(firstSpan);
  });
});
