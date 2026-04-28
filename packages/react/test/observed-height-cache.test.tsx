import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Inkset,
  type ASTNode,
  type EnrichedNode,
  type InksetPlugin,
  type PluginComponentProps,
} from "../src/index.js";

const HEURISTIC_HEIGHT = 20;
const SHRINKING_HEURISTIC_HEIGHT = 120;
const SHRINKING_SETTLED_HEIGHT = 40;
const PARAGRAPH_HEURISTIC_HEIGHT = 24;
const INLINE_MATH_SETTLED_HEIGHT = 90;

const getSettledHeight = (width: number): number => {
  if (width >= 280) return 80;
  if (width >= 180) return 44;
  return 28;
};

const AsyncMeasuredMathBlock = ({ node: _node, onContentSettled }: PluginComponentProps) => {
  const blockRef = useRef<HTMLDivElement>(null);
  const prevSettledCallbackRef = useRef(onContentSettled);
  const [readyWidth, setReadyWidth] = useState<number | null>(null);
  const callbackChanged = prevSettledCallbackRef.current !== onContentSettled;
  const isSettled = readyWidth !== null && !callbackChanged;
  const settledHeight = isSettled ? getSettledHeight(readyWidth) : HEURISTIC_HEIGHT;

  useEffect(() => {
    const blockWidth = Number.parseInt(blockRef.current?.parentElement?.style.width ?? "0", 10);
    prevSettledCallbackRef.current = onContentSettled;
    setReadyWidth(null);
    const timeoutId = window.setTimeout(() => {
      setReadyWidth(blockWidth);
    }, 10);
    return () => window.clearTimeout(timeoutId);
  }, [onContentSettled]);

  useLayoutEffect(() => {
    if (isSettled) {
      onContentSettled?.();
    }
  }, [isSettled, onContentSettled]);

  const renderedHeight = isSettled ? settledHeight : HEURISTIC_HEIGHT;
  return (
    <div
      ref={blockRef}
      data-testid="async-math"
      data-measured-height={renderedHeight}
      data-render-width={readyWidth ?? 0}
      style={{ height: `${renderedHeight}px` }}
    >
      async math
    </div>
  );
};

const createAsyncMathPlugin = (): InksetPlugin => {
  return {
    name: "async-math",
    handles: ["math-display"],
    transform(node: ASTNode): EnrichedNode {
      return {
        ...node,
        transformedBy: "async-math",
      };
    },
    measure(node, maxWidth) {
      return {
        width: maxWidth,
        height: HEURISTIC_HEIGHT,
      };
    },
    component: AsyncMeasuredMathBlock,
  };
};

const ShrinkingAsyncBlock = ({ onContentSettled }: PluginComponentProps) => {
  const [settled, setSettled] = useState(false);
  const renderedHeight = settled ? SHRINKING_SETTLED_HEIGHT : SHRINKING_HEURISTIC_HEIGHT;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSettled(true);
    }, 10);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useLayoutEffect(() => {
    if (settled) {
      onContentSettled?.();
    }
  }, [settled, onContentSettled]);

  return (
    <div
      data-testid="shrinking-block"
      data-measured-height={renderedHeight}
      style={{ height: `${renderedHeight}px` }}
    >
      shrinking block
    </div>
  );
};

const createShrinkingAsyncPlugin = (): InksetPlugin => {
  return {
    name: "shrinking-async",
    handles: ["math-display"],
    transform(node: ASTNode): EnrichedNode {
      return {
        ...node,
        transformedBy: "shrinking-async",
      };
    },
    measure(node, maxWidth) {
      return {
        width: maxWidth,
        height: SHRINKING_HEURISTIC_HEIGHT,
      };
    },
    component: ShrinkingAsyncBlock,
  };
};

const AsyncInlineMath = ({ node: _node, onContentSettled }: PluginComponentProps) => {
  const [settled, setSettled] = useState(false);
  const renderedHeight = settled ? INLINE_MATH_SETTLED_HEIGHT : HEURISTIC_HEIGHT;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSettled(true);
    }, 10);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useLayoutEffect(() => {
    if (settled) {
      onContentSettled?.();
    }
  }, [settled, onContentSettled]);

  return (
    <span
      data-testid="async-inline-math"
      data-measured-height={renderedHeight}
      style={{ display: "inline-block", height: `${renderedHeight}px` }}
    >
      inline math
    </span>
  );
};

const createAsyncInlineMathPlugin = (): InksetPlugin & { rendererName: string } => {
  return {
    name: "math",
    rendererName: "test",
    handles: [],
    transform(node: ASTNode): EnrichedNode {
      return node as EnrichedNode;
    },
    component: AsyncInlineMath,
  };
};

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

const runPendingTimers = async (): Promise<void> => {
  await act(async () => {
    vi.advanceTimersByTime(20);
  });
  await flushMicrotasks();
};

const waitFor = async (predicate: () => boolean, message: string): Promise<void> => {
  for (let i = 0; i < 20; i++) {
    if (predicate()) return;
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    await flushMicrotasks();
  }
  throw new Error(message);
};

const getTranslatedY = (element: HTMLElement): number => {
  const match = element.style.transform.match(/translate\([^,]+,\s*([^)]+)px\)/);
  if (!match) {
    throw new Error(`Expected translate transform, got "${element.style.transform}"`);
  }
  return Number(match[1]);
};

describe("Inkset observed height cache", () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined;
  let originalRequestAnimationFrame: typeof globalThis.requestAnimationFrame | undefined;
  let originalCancelAnimationFrame: typeof globalThis.cancelAnimationFrame | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    originalResizeObserver = globalThis.ResizeObserver;
    originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      window.setTimeout(() => cb(performance.now()), 0)) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) =>
      window.clearTimeout(id)) as typeof cancelAnimationFrame;

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
      const selfHeight = Number((this as HTMLElement).dataset.measuredHeight ?? 0);
      const minHeight = Number.parseInt((this as HTMLElement).style.minHeight || "0", 10) || 0;
      const descendantHeight = Number(
        (this as HTMLElement).querySelector<HTMLElement>("[data-measured-height]")?.dataset
          .measuredHeight ?? 0,
      );
      const height = Math.max(selfHeight, descendantHeight, minHeight);
      const width = Number.parseInt((this as HTMLElement).style.width || "0", 10) || 0;

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
    globalThis.requestAnimationFrame =
      originalRequestAnimationFrame as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame as typeof cancelAnimationFrame;
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
  });

  it("reuses the previously observed height when returning to a width", async () => {
    const plugin = createAsyncMathPlugin();
    const content = "$$x$$\n\nTail paragraph.";

    const renderAtWidth = async (width: number) => {
      await act(async () => {
        root.render(
          <Inkset
            content={content}
            streaming
            width={width}
            blockSpacing={{ default: 12 }}
            plugins={[plugin]}
          />,
        );
      });
      await flushMicrotasks();
      await act(async () => {
        vi.advanceTimersByTime(0);
      });
      await flushMicrotasks();
    };

    const getFrozenMathBlock = (): HTMLElement => {
      const block = container.querySelector<HTMLElement>('[data-block-id="0"]');
      expect(block).not.toBeNull();
      return block!;
    };

    await renderAtWidth(300);
    expect(getFrozenMathBlock().style.minHeight).toBe("20px");

    await runPendingTimers();
    expect(getFrozenMathBlock().style.minHeight).toBe("80px");

    await renderAtWidth(200);
    await waitFor(
      () => getFrozenMathBlock().style.width === "200px",
      "expected the frozen math block to relayout to width 200px",
    );
    await runPendingTimers();
    expect(getFrozenMathBlock().style.minHeight).toBe("44px");

    await renderAtWidth(300);
    await waitFor(
      () => getFrozenMathBlock().style.width === "300px",
      "expected the frozen math block to relayout back to width 300px",
    );
    expect(getFrozenMathBlock().style.minHeight).toBe("80px");
  });

  it("allows sync-settled frozen blocks to shrink below their provisional minHeight", async () => {
    const plugin = createShrinkingAsyncPlugin();
    const content = "$$x$$\n\nTail paragraph.";

    await act(async () => {
      root.render(
        <Inkset
          content={content}
          streaming
          width={300}
          blockSpacing={{ default: 12 }}
          plugins={[plugin]}
        />,
      );
    });
    await flushMicrotasks();

    const frozenBlock = container.querySelector<HTMLElement>('[data-block-id="0"]');
    expect(frozenBlock).not.toBeNull();
    expect(frozenBlock!.style.minHeight).toBe("120px");

    await runPendingTimers();

    expect(frozenBlock!.style.minHeight).toBe("40px");
  });

  it("uses inline math content settlement to reposition following frozen blocks", async () => {
    const plugin = createAsyncInlineMathPlugin();
    const content = "First $\\frac{a}{b}$ paragraph.\n\nSecond paragraph.\n\nThird paragraph.";

    await act(async () => {
      root.render(
        <Inkset
          content={content}
          streaming
          width={300}
          blockSpacing={{ default: 12 }}
          plugins={[plugin]}
        />,
      );
    });
    await flushMicrotasks();

    const firstBlock = container.querySelector<HTMLElement>('[data-block-id="0"]');
    const secondBlock = container.querySelector<HTMLElement>('[data-block-id="1"]');
    expect(firstBlock).not.toBeNull();
    expect(secondBlock).not.toBeNull();
    expect(firstBlock!.style.minHeight).toBe(`${PARAGRAPH_HEURISTIC_HEIGHT}px`);
    expect(getTranslatedY(secondBlock!)).toBe(PARAGRAPH_HEURISTIC_HEIGHT + 12);

    await runPendingTimers();

    expect(firstBlock!.style.minHeight).toBe(`${INLINE_MATH_SETTLED_HEIGHT}px`);
    expect(getTranslatedY(secondBlock!)).toBe(INLINE_MATH_SETTLED_HEIGHT + 12);
  });
});
