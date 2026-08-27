// Renders the two document shapes from issue #14 that used to leave visual
// debris: an empty scroll anchor before a heading, and a GFM footnote.
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
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    await flushMicrotasks();
  }
};

describe("<Inkset> raw HTML and footnotes", () => {
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

  const reactErrors = () =>
    consoleErrors.filter(
      (args) => typeof args[0] === "string" && !args[0].includes("not wrapped in act"),
    );

  it("renders a scroll anchor as an invisible <a id> that takes no layout space", async () => {
    await act(async () => {
      root.render(
        <Inkset content={'<a id="section-1"></a>\n## Section 1'} streaming={false} width={480} />,
      );
    });
    await settle();

    expect(container.querySelector("a#section-1")).not.toBeNull();
    expect(container.querySelector("p div")).toBeNull();
    expect(container.querySelector("h2")?.textContent).toBe("Section 1");

    // The anchor block is zero-height, so the heading sits at y = 0.
    const heading = container.querySelector<HTMLElement>('[data-block-id="1"]');
    expect(heading?.style.transform).toBe("translate(0px, 0px)");
    expect(reactErrors()).toEqual([]);
  });

  it("resolves a footnote reference and renders the footnote list", async () => {
    await act(async () => {
      root.render(
        <Inkset
          content={"Text with a note[^1].\n\n[^1]: The note."}
          streaming={false}
          width={480}
        />,
      );
    });
    await settle();

    const ref = container.querySelector<HTMLAnchorElement>("sup a[data-footnote-ref]");
    expect(ref?.textContent).toBe("1");
    expect(ref?.getAttribute("href")).toBe("#user-content-fn-1");
    expect(ref?.getAttribute("aria-describedby")).toBe("footnote-label");

    const section = container.querySelector("section.footnotes[data-footnotes]");
    expect(section).not.toBeNull();
    expect(section?.querySelector("li#user-content-fn-1")?.textContent).toContain("The note.");
    expect(section?.querySelector("a[data-footnote-backref]")).not.toBeNull();
    expect(reactErrors()).toEqual([]);
  });
});
