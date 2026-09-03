// Shiki loading degrades per theme: a rejected initialization is retried on
// the next request, and a theme that fails to load costs only that theme —
// never its companion, and never the fallback everything degrades to.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createHighlighter } = vi.hoisted(() => ({ createHighlighter: vi.fn() }));
vi.mock("shiki", () => ({ createHighlighter }));

const makeInstance = (failingTheme?: string) => ({
  codeToHtml: () => "<pre></pre>",
  loadTheme: vi.fn((theme: string) =>
    theme === failingTheme
      ? Promise.reject(new Error(`Theme ${theme} is not included`))
      : Promise.resolve(),
  ),
  loadLanguage: vi.fn().mockResolvedValue(undefined),
});

const loadPlugin = async () => (await import("../src/index.js")).createCodePlugin;

describe("shiki loading", () => {
  beforeEach(() => {
    // The cached highlighter and the loaded/failed sets are module state.
    vi.resetModules();
    createHighlighter.mockReset();
  });

  it("retries after a rejected initialization", async () => {
    const createCodePlugin = await loadPlugin();
    const instance = makeInstance();
    createHighlighter.mockRejectedValueOnce(new Error("chunk load failed"));
    createHighlighter.mockResolvedValue(instance);

    await expect(createCodePlugin({ theme: "one-dark-pro" }).preload()).rejects.toThrow();
    await expect(createCodePlugin({ theme: "one-dark-pro" }).preload()).resolves.toBeUndefined();
    expect(createHighlighter).toHaveBeenCalledTimes(2);
    expect(instance.loadTheme).toHaveBeenCalledWith("one-dark-pro");
  });

  it("initializes with the fallback theme and loads requested themes one by one", async () => {
    const createCodePlugin = await loadPlugin();
    const instance = makeInstance("nope-light");
    createHighlighter.mockResolvedValue(instance);

    const plugin = createCodePlugin({ theme: "one-dark-pro", lightTheme: "nope-light" });
    await expect(plugin.preload()).resolves.toBeUndefined();
    expect(createHighlighter.mock.calls[0][0].themes).toEqual(["github-dark"]);
    expect(instance.loadTheme.mock.calls.map(([theme]) => theme)).toEqual([
      "one-dark-pro",
      "nope-light",
    ]);

    // The failed theme is remembered, and the working one stays loaded.
    instance.loadTheme.mockClear();
    await plugin.preload();
    expect(instance.loadTheme).not.toHaveBeenCalled();
  });
});
