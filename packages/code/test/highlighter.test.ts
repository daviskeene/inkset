// A failed shiki initialization must not poison the highlighter for the rest
// of the page: the next request retries (with the fallback theme).
import { describe, expect, it, vi } from "vitest";

const createHighlighter = vi.fn();
vi.mock("shiki", () => ({ createHighlighter }));

describe("shiki loading", () => {
  it("retries after a rejected initialization", async () => {
    const { createCodePlugin } = await import("../src/index.js");
    createHighlighter.mockRejectedValueOnce(new Error("Theme nope-theme is not included"));
    const instance = {
      codeToHtml: () => "<pre></pre>",
      loadTheme: vi.fn().mockResolvedValue(undefined),
      loadLanguage: vi.fn().mockResolvedValue(undefined),
    };
    createHighlighter.mockResolvedValue(instance);

    await expect(createCodePlugin({ theme: "nope-theme" }).preload()).rejects.toThrow();
    await expect(createCodePlugin({ theme: "github-dark" }).preload()).resolves.toBeUndefined();
    expect(createHighlighter).toHaveBeenCalledTimes(2);
    // The typo'd theme is remembered as failed and not requested again.
    expect(createHighlighter.mock.calls[1][0].themes).toEqual(["github-dark"]);
  });
});
