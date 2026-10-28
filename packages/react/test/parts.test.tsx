// Guards InksetParts: surfaces keep their component instance across part
// insertions, reorders, and data updates, and stay outside every Markdown
// part's live region.
import React, { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InksetParts, type InksetPart, type InksetSurfacePart } from "../src/index.js";

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

const lifetimes = { mounts: 0, unmounts: 0 };

const Counter = ({ part }: { part: InksetSurfacePart<string> }) => {
  useEffect(() => {
    lifetimes.mounts++;
    return () => {
      lifetimes.unmounts++;
    };
  }, []);
  return <input data-testid="surface" defaultValue={part.data} />;
};

const renderSurface = (part: InksetSurfacePart<string>) => <Counter part={part} />;

describe("InksetParts", () => {
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

    lifetimes.mounts = 0;
    lifetimes.unmounts = 0;
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

  const render = async (parts: InksetPart<string>[]) => {
    await act(async () => {
      root.render(<InksetParts parts={parts} renderSurface={renderSurface} width={320} />);
    });
    await settle();
  };

  it("keeps a surface's instance across insertion, reorder, and data updates", async () => {
    const intro: InksetPart<string> = { id: "intro", type: "markdown", content: "Intro" };
    const surface: InksetPart<string> = { id: "form", type: "surface", data: "v1" };
    const tail: InksetPart<string> = { id: "tail", type: "markdown", content: "Tail" };

    await render([intro, surface, tail]);
    const input = container.querySelector('[data-testid="surface"]') as HTMLInputElement;
    input.value = "typed by the user";

    await render([intro, { id: "inserted", type: "markdown", content: "Inserted" }, surface, tail]);
    await render([intro, tail, { ...surface, data: "v2" }]);

    expect(lifetimes).toEqual({ mounts: 1, unmounts: 0 });
    expect(container.querySelector('[data-testid="surface"]')).toBe(input);
    expect(input.value).toBe("typed by the user");
    expect(
      [...container.querySelectorAll("[data-inkset-part]")].map((element) =>
        element.getAttribute("data-inkset-part"),
      ),
    ).toEqual(["intro", "tail", "form"]);
    expect(container.textContent).toContain("Tail");
  });

  it("renders surfaces outside the Markdown parts' live regions", async () => {
    await render([
      { id: "intro", type: "markdown", content: "Intro" },
      { id: "form", type: "surface", data: "v1" },
    ]);

    const surface = container.querySelector('[data-testid="surface"]')!;
    expect(surface.closest('[role="log"], [aria-live], [aria-hidden="true"]')).toBeNull();
    expect(container.querySelectorAll('[role="log"]')).toHaveLength(1);
  });

  it("shows the loading fallback for the first Markdown part only", () => {
    // Server rendering runs no effects, so every part is still loading.
    const html = renderToStaticMarkup(
      <InksetParts
        parts={[
          { id: "a", type: "markdown", content: "Alpha" },
          { id: "b", type: "markdown", content: "Beta" },
        ]}
        renderSurface={renderSurface}
        loadingFallback={<span data-testid="loading" />}
      />,
    );

    expect(html.match(/data-testid="loading"/g)).toHaveLength(1);
  });
});
