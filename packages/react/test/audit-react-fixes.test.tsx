// Regression tests for the React-renderer audit: reveal gate rebuilds,
// stale heights across document replacement, hot→frozen identity, partial
// copy, mount cost, and downward height correction.
import React, { StrictMode, useEffect, useLayoutEffect, useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamingPipeline, type InksetPlugin, type PluginComponentProps } from "@inkset/core";
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

const settle = async (ticks = 8): Promise<void> => {
  for (let i = 0; i < ticks; i++) {
    await act(async () => {
      vi.advanceTimersByTime(40);
    });
    await flushMicrotasks();
  }
};

/** A plugin whose block renders at a fixed DOM height. */
const tallPlugin = (height: number): InksetPlugin => ({
  name: "tall",
  handles: ["code"],
  transform: (node) => ({ ...node, pluginData: { height } }),
  measure: () => ({ width: 0, height }),
  component: ({ node }) => (
    <div data-measured-height={String((node.pluginData?.height as number) ?? 0)}>tall</div>
  ),
});

/** A block whose DOM starts as a short raw fallback and settles taller later. */
const makeSettlingBlock = (provisional: number, settled: number, delayMs: number) => {
  const SettlingBlock = ({ onContentSettled }: PluginComponentProps) => {
    const [done, setDone] = useState(false);
    useEffect(() => {
      const timer = setTimeout(() => setDone(true), delayMs);
      return () => clearTimeout(timer);
    }, []);
    useLayoutEffect(() => {
      if (done) onContentSettled?.();
    }, [done, onContentSettled]);
    return <div data-measured-height={String(done ? settled : provisional)}>settling</div>;
  };
  return SettlingBlock;
};

const settlingPlugin = (provisional: number, settled: number, delayMs: number): InksetPlugin => ({
  name: "settling",
  handles: ["code"],
  transform: (node) => ({ ...node, pluginData: {} }),
  measure: () => ({ width: 0, height: 100 }),
  component: makeSettlingBlock(provisional, settled, delayMs),
});

describe("React renderer audit fixes", () => {
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

    // jsdom has no layout. Elements declare their rendered height with
    // `data-measured-height`; wrappers report the tallest declared descendant
    // (never their own min-height — that is what the fix under test relies on).
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const el = this as HTMLElement;
      const own = Number(el.dataset.measuredHeight ?? 0);
      const descendant = Number(
        el.querySelector<HTMLElement>("[data-measured-height]")?.dataset.measuredHeight ?? 0,
      );
      const height = Math.max(own, descendant);
      const width = Number.parseInt(el.style.width || "0", 10) || 0;
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: height,
        right: width,
        width,
        height,
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

  it("delivers the full streamed content through the reveal gate under StrictMode", async () => {
    await act(async () => {
      root.render(
        <StrictMode>
          <Inkset content="Hello world foo " streaming width={480} reveal={{}} />
        </StrictMode>,
      );
    });
    await settle();
    await act(async () => {
      root.render(
        <StrictMode>
          <Inkset content="Hello world foo bar " streaming width={480} reveal={{}} />
        </StrictMode>,
      );
    });
    await settle();
    expect(container.querySelector(".inkset-root")?.textContent).toContain("Hello world foo bar");
  });

  it("keeps every token when reveal.component is an inline arrow", async () => {
    const steps = [
      "One two ",
      "One two three four ",
      "One two three four five six ",
      "One two three four five six seven ",
    ];
    for (const step of steps) {
      await act(async () => {
        root.render(
          <Inkset
            content={step}
            streaming
            width={480}
            reveal={{ component: (props) => <span>{props.children}</span> }}
          />,
        );
      });
      await settle(3);
    }
    await settle();
    expect(container.querySelector(".inkset-root")?.textContent).toContain(
      "One two three four five six seven",
    );
  });

  it("does not let a replaced document inherit the previous document's observed heights", async () => {
    const plugins = [tallPlugin(200)];
    await act(async () => {
      root.render(
        <Inkset
          content={"```js\nx\n```\n\nSecond\n\nThird"}
          streaming={false}
          width={480}
          plugins={plugins}
        />,
      );
    });
    await settle();
    expect(container.querySelector<HTMLElement>('[data-block-id="0"]')?.style.minHeight).toBe(
      "200px",
    );

    await act(async () => {
      root.render(
        <Inkset
          content={"Alpha.\n\nBeta.\n\nGamma."}
          streaming={false}
          width={480}
          plugins={plugins}
        />,
      );
    });
    await settle();
    const first = container.querySelector<HTMLElement>('[data-block-id="0"]');
    expect(first?.textContent).toBe("Alpha.");
    expect(Number.parseInt(first?.style.minHeight ?? "0", 10)).toBeLessThan(100);
  });

  it("keeps the same DOM element when the hot block freezes", async () => {
    await act(async () => {
      root.render(<Inkset content="Alpha" streaming width={480} />);
    });
    await settle();
    const before = container.querySelector('[data-block-id="0"]');
    expect(before).not.toBeNull();

    await act(async () => {
      root.render(<Inkset content={"Alpha\n\nBeta"} streaming width={480} />);
    });
    await settle();
    const after = container.querySelector('[data-block-id="0"]');
    expect(after).toBe(before);
    expect(after?.getAttribute("style")).toContain("position: absolute");
  });

  it("copies only the selected part of a code block", async () => {
    await act(async () => {
      root.render(
        <Inkset
          content={"Intro text\n\n```\nline1\nline2\nline3\n```"}
          streaming={false}
          width={480}
        />,
      );
    });
    await settle();
    const code = container.querySelector("pre code");
    const textNode = code?.firstChild;
    expect(textNode?.nodeType).toBe(Node.TEXT_NODE);
    const range = document.createRange();
    range.setStart(textNode as Text, 6); // "line2"
    range.setEnd(textNode as Text, 11);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const setData = vi.fn();
    const event = new Event("copy", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", { value: { setData } });
    container.querySelector(".inkset-root")?.dispatchEvent(event);
    if (setData.mock.calls.length > 0) {
      expect(setData).toHaveBeenCalledWith("text/plain", "line2");
    } else {
      // Browser default copy — also correct (nothing overrode the selection).
      expect(event.defaultPrevented).toBe(false);
    }
  });

  it("submits static content to the pipeline once per mount", async () => {
    const spy = vi.spyOn(StreamingPipeline.prototype, "setContent");
    await act(async () => {
      root.render(<Inkset content="Hi there" streaming={false} width={300} />);
    });
    await settle();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("lets a frozen block shrink below its estimate once the DOM reports it", async () => {
    // Paragraph text renders at 10px in this fake DOM (estimate is 24px).
    const mock = vi.mocked(HTMLElement.prototype.getBoundingClientRect);
    mock.mockImplementation(function () {
      const el = this as HTMLElement;
      const height = el.classList.contains("inkset-default-block") ? 10 : 0;
      const width = Number.parseInt(el.style.width || "0", 10) || 0;
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: height,
        right: width,
        width,
        height,
      } as DOMRect;
    });
    await act(async () => {
      root.render(<Inkset content={"Alpha\n\nBeta"} streaming={false} width={480} />);
    });
    await settle();
    expect(container.querySelector<HTMLElement>('[data-block-id="0"]')?.style.minHeight).toBe(
      "10px",
    );
  });

  it("holds a plugin block at its estimate until the plugin settles", async () => {
    const plugins = [settlingPlugin(20, 80, 1000)];
    await act(async () => {
      root.render(
        <Inkset
          content={"```js\nx\n```\n\nAfter"}
          streaming={false}
          width={480}
          plugins={plugins}
        />,
      );
    });
    await settle(3);
    const block = container.querySelector<HTMLElement>('[data-block-id="0"]');
    // The 20px raw fallback is provisional: the 100px reservation stands.
    expect(block?.style.minHeight).toBe("100px");

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await settle();
    // The settled report is trusted in both directions.
    expect(block?.style.minHeight).toBe("80px");
  });

  it("does not duplicate a chunk the gate emitted synchronously when StrictMode rebuilds it", async () => {
    await act(async () => {
      root.render(
        <StrictMode>
          <Inkset
            content="Hello world "
            streaming
            width={480}
            reveal={{ throttle: { delayInMs: 0 } }}
          />
        </StrictMode>,
      );
    });
    await settle();
    // The block itself, not the root: the aria-live mirror repeats the text.
    const text = container.querySelector('[data-block-id="0"]')?.textContent ?? "";
    expect(text.match(/Hello/g)).toHaveLength(1);
  });
});
