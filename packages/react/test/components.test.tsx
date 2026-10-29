// Guards the `components` prop: element overrides in the shape react-markdown
// and Streamdown use, so apps can move their customizations over unchanged.
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Inkset, type InksetComponents, type InksetElementProps } from "../src/index.js";

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

describe("components", () => {
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

  const render = async (
    content: string,
    components: InksetComponents,
    extra: Partial<React.ComponentProps<typeof Inkset>> = {},
  ) => {
    await act(async () => {
      root.render(<Inkset content={content} components={components} width={320} {...extra} />);
    });
    await settle();
  };

  it("replaces an element and passes its rendered children", async () => {
    const Strong = ({ children }: InksetElementProps<"strong">) => (
      <b data-testid="custom">{children}</b>
    );
    await render("Hello **world** again", { strong: Strong });

    const custom = container.querySelector('b[data-testid="custom"]');
    expect(custom?.textContent).toBe("world");
    expect(container.querySelector("strong")).toBeNull();
  });

  it("gives a link override its href, title, node, and linkAttrs props", async () => {
    const seen: Array<InksetElementProps<"a">> = [];
    const Link = (props: InksetElementProps<"a">) => {
      seen.push(props);
      return <a href={props.href}>{props.children}</a>;
    };
    await render(
      'See [the docs](https://inkset.dev "cite").',
      { a: Link },
      { linkAttrs: () => ({ target: "_blank" }) },
    );

    const props = seen.at(-1);
    expect(props?.href).toBe("https://inkset.dev");
    expect(props?.title).toBe("cite");
    expect(props?.target).toBe("_blank");
    expect(props?.node?.tagName).toBe("a");
  });

  it("applies inlineCode to inline code only", async () => {
    const InlineCode = ({ children }: InksetElementProps<"code">) => <kbd>{children}</kbd>;
    await render("Run `npm test` now.\n\n```\nblock code\n```", { inlineCode: InlineCode });

    expect(container.querySelector("kbd")?.textContent).toBe("npm test");
    expect(container.querySelector("pre code")?.textContent).toContain("block code");
  });

  it("accepts a tag name in place of a component", async () => {
    await render("## A heading\n\nText.", { h2: "h3" });

    expect(container.querySelector("h3")?.textContent).toBe("A heading");
    expect(container.querySelector("h2")).toBeNull();
  });

  // Apps that restyle headings in overrides also need to match their letter-spacing.
  it("sets heading tracking on the root", async () => {
    await render("## A heading", {}, { headingTracking: [0, 0, 0, 0] });

    const root = container.querySelector<HTMLElement>(".inkset-root");
    expect(root?.style.getPropertyValue("--inkset-heading-2-tracking")).toBe("0em");
  });
});
