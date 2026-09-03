// Shrinkwrap and glyph lookups must wrap at the same tracking-compensated
// width as the height estimate, or a tracked heading that measured as one line
// gets a max-width that wraps it onto two.
import { describe, expect, it, vi } from "vitest";

const { measureLineStats } = vi.hoisted(() => ({
  measureLineStats: vi.fn((_prepared: unknown, _maxWidth: number) => ({
    lineCount: 1,
    maxLineWidth: 200,
  })),
}));

vi.mock("@chenglou/pretext", () => ({
  prepare: (text: string, font: string) => ({ text, font }),
  prepareWithSegments: (text: string, font: string) => ({ text, font }),
  layout: () => ({ height: 24, lineCount: 1 }),
  layoutWithLines: () => ({ height: 24, lineCount: 1, lines: [] }),
  measureLineStats,
  measureNaturalWidth: () => 200,
}));

describe("shrinkwrap under heading tracking", () => {
  it("wraps at the compensated width and reports the width in DOM pixels", async () => {
    const { MeasureLayer } = await import("../src/measure.js");
    const layer = new MeasureLayer({ font: "sans-serif", fontSize: 16, lineHeight: 24 });

    // Body text has no tracking: nothing to compensate.
    expect(await layer.measureShrinkwrapWidth("Title", 300)).toEqual({
      width: 200,
      lineCount: 1,
    });
    expect(measureLineStats).toHaveBeenLastCalledWith(expect.anything(), 300);

    // h1 is 48px with -0.04em tracking: every glyph draws 1.92px narrower than
    // pretext's 24px average, so a line holds 1/0.92 of the width.
    const heading = await layer.measureShrinkwrapWidth("Title", 300, 1);
    expect(measureLineStats).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.closeTo(300 / 0.92, 6),
    );
    expect(heading?.lineCount).toBe(1);
    expect(heading?.width).toBeCloseTo(200 * 0.92, 6);
  });
});
