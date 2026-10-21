// Guards for renderer costs that should scale with what changed, not with the
// size of the document or the number of mounted instances.
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { wrappedBlockIds } = vi.hoisted(() => ({ wrappedBlockIds: [] as number[] }));

vi.mock("@inkset/animate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@inkset/animate")>();
  return {
    ...actual,
    wrapBlockDelta: (...args: Parameters<typeof actual.wrapBlockDelta>) => {
      wrappedBlockIds.push(args[0].blockId);
      return actual.wrapBlockDelta(...args);
    },
  };
});

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

const nextFrame = async (): Promise<void> => {
  await act(async () => {
    vi.advanceTimersByTime(20);
  });
  await flushMicrotasks();
};

describe("renderer perf regressions", () => {
  const roots: Root[] = [];
  const containers: HTMLDivElement[] = [];
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined;

  const mount = (): Root => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    containers.push(container);
    const root = createRoot(container);
    roots.push(root);
    return root;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () =>
        ({
          font: "",
          measureText: (text: string) => ({ width: text.length * 8 }),
        }) as unknown as CanvasRenderingContext2D,
    );
    wrappedBlockIds.length = 0;
  });

  afterEach(async () => {
    await act(async () => {
      for (const root of roots) root.unmount();
    });
    for (const container of containers) container.remove();
    roots.length = 0;
    containers.length = 0;
    vi.restoreAllMocks();
    vi.useRealTimers();
    globalThis.ResizeObserver = originalResizeObserver as typeof ResizeObserver;
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
  });

  it("does not re-wrap frozen blocks on every reveal tick", async () => {
    const root = mount();
    const reveal = {
      throttle: false as const,
      timeline: { durationMs: 120, stagger: 10 },
      css: { preset: "fadeIn" as const },
    };
    const frozen = "First paragraph stays put.\n\nSecond paragraph too.\n\n";
    const words = ["Third", "paragraph", "keeps", "growing", "while", "streaming"];

    let content = frozen;
    for (const word of words) {
      content += `${word} `;
      await act(async () => {
        root.render(<Inkset content={content} streaming width={320} reveal={reveal} />);
      });
      await nextFrame();
    }

    // Each frozen block is wrapped once, when it first appears; afterwards its
    // node is unchanged and fully revealed, so later ticks skip it. The hot
    // block is wrapped on every tick that changed it.
    expect(wrappedBlockIds.filter((id) => id === 0)).toHaveLength(1);
    expect(wrappedBlockIds.filter((id) => id === 1)).toHaveLength(1);
    expect(wrappedBlockIds.filter((id) => id === 2).length).toBeGreaterThan(1);

    const tokens = Array.from(
      containers[0].querySelectorAll<HTMLElement>("[data-inkset-reveal-token]"),
    ).map((el) => el.textContent);
    expect(tokens).toContain("streaming");
  });

  it("shares one stylesheet across instances", async () => {
    const first = mount();
    const second = mount();
    await act(async () => {
      first.render(<Inkset content="One" width={320} />);
      second.render(<Inkset content="Two" width={320} />);
    });
    await nextFrame();

    const sheets = Array.from(document.querySelectorAll("style")).filter((el) =>
      el.textContent?.includes(".inkset-root"),
    );
    expect(sheets).toHaveLength(1);
    expect(sheets[0].parentElement).toBe(document.head);
  });

  it("does not promote frozen blocks to their own compositor layers", async () => {
    const root = mount();
    await act(async () => {
      root.render(<Inkset content={"Alpha\n\nBeta\n\nGamma"} width={320} />);
    });
    await nextFrame();

    const blocks = containers[0].querySelectorAll<HTMLElement>("[data-block-id]");
    expect(blocks.length).toBe(3);
    for (const block of blocks) {
      expect(block.style.position).toBe("absolute");
      expect(block.style.willChange).toBe("");
    }
  });
});
