import { describe, it, expect } from "vitest";
import { buildGlyphLookup, type GlyphPretextModule } from "../src/glyph-positions";

// Minimal pretext stub that behaves deterministically for test inputs. Real
// pretext uses canvas under the hood; we just simulate its output shape:
//   - prepareWithSegments on the full text returns the configured segments;
//     on a substring (the `locate()` path), returns segments for that slice.
//   - layoutWithLines returns the line boundaries we specify.
//   - measureNaturalWidth returns substring length × 10 as a pseudo-width.
const makeStubPretext = (config: {
  fullText: string;
  segments: string[];
  lines: Array<{
    text: string;
    startSeg: number;
    startGrapheme: number;
    endSeg: number;
    endGrapheme: number;
  }>;
}): GlyphPretextModule => ({
  prepareWithSegments(text: string) {
    if (text === config.fullText) return { segments: config.segments };
    return { segments: text.length === 0 ? [] : [text] };
  },
  layoutWithLines(prepared, _maxWidth, _lineHeight) {
    const segs = (prepared as { segments: string[] }).segments;
    if (segs === config.segments) {
      return {
        lineCount: config.lines.length,
        height: 0,
        lines: config.lines.map((l) => ({
          text: l.text,
          width: l.text.length * 10,
          start: { segmentIndex: l.startSeg, graphemeIndex: l.startGrapheme },
          end: { segmentIndex: l.endSeg, graphemeIndex: l.endGrapheme },
        })),
      };
    }
    // Substring path — not used by the lookup, but included for completeness.
    const text = segs.join("");
    return {
      lineCount: 1,
      height: 0,
      lines: [
        {
          text,
          width: text.length * 10,
          start: { segmentIndex: 0, graphemeIndex: 0 },
          end: {
            segmentIndex: segs.length - 1,
            graphemeIndex: segs[segs.length - 1]?.length ?? 0,
          },
        },
      ],
    };
  },
  measureNaturalWidth(prepared) {
    const segs = (prepared as { segments: string[] }).segments;
    return segs.join("").length * 10;
  },
});

describe("buildGlyphLookup", () => {
  it("returns null when pretext is unavailable", () => {
    const lookup = buildGlyphLookup(null, {
      text: "hello world",
      font: "16px sans",
      maxWidth: 200,
      lineHeight: 24,
    });
    expect(lookup).toBeNull();
  });

  it("returns null for empty text", () => {
    const pretext = makeStubPretext({ fullText: "", segments: [], lines: [] });
    const lookup = buildGlyphLookup(pretext, {
      text: "",
      font: "16px sans",
      maxWidth: 200,
      lineHeight: 24,
    });
    expect(lookup).toBeNull();
  });

  it("resolves coords for a single-line paragraph", () => {
    // "hello world" — one segment "hello world", all on line 0.
    const pretext = makeStubPretext({
      fullText: "hello world",
      segments: ["hello world"],
      lines: [
        {
          text: "hello world",
          startSeg: 0,
          startGrapheme: 0,
          endSeg: 0,
          endGrapheme: 11,
        },
      ],
    });

    const lookup = buildGlyphLookup(pretext, {
      text: "hello world",
      font: "16px sans",
      maxWidth: 200,
      lineHeight: 24,
    });
    expect(lookup).not.toBeNull();

    // "hello" at offset [0, 5) → x = 0, y = 0 (line 0), width = 5 * 10 = 50.
    const hello = lookup!.locate(0, 5);
    expect(hello).toEqual({
      x: 0,
      y: 0,
      width: 50,
      height: 24,
      lineIndex: 0,
    });

    // "world" at [6, 11) → x = width of "hello " (60), y = 0, width = 50.
    const world = lookup!.locate(6, 11);
    expect(world?.x).toBe(60); // "hello " = 6 chars × 10
    expect(world?.y).toBe(0);
    expect(world?.width).toBe(50);
  });

  it("returns different y for tokens on different lines", () => {
    // "alpha\nbeta" — one segment per line.
    const pretext = makeStubPretext({
      fullText: "alpha\nbeta",
      segments: ["alpha", "\n", "beta"],
      lines: [
        {
          text: "alpha",
          startSeg: 0,
          startGrapheme: 0,
          endSeg: 0,
          endGrapheme: 5,
        },
        {
          text: "beta",
          startSeg: 2,
          startGrapheme: 0,
          endSeg: 2,
          endGrapheme: 4,
        },
      ],
    });

    const lookup = buildGlyphLookup(pretext, {
      text: "alpha\nbeta",
      font: "16px sans",
      maxWidth: 200,
      lineHeight: 20,
    });

    const alpha = lookup!.locate(0, 5);
    const beta = lookup!.locate(6, 10);
    expect(alpha?.y).toBe(0);
    expect(beta?.y).toBe(20); // second line at 1 × lineHeight
    expect(alpha?.lineIndex).toBe(0);
    expect(beta?.lineIndex).toBe(1);
  });

  it("returns null for charStart outside the laid-out text", () => {
    const pretext = makeStubPretext({
      fullText: "hello",
      segments: ["hello"],
      lines: [
        { text: "hello", startSeg: 0, startGrapheme: 0, endSeg: 0, endGrapheme: 5 },
      ],
    });
    const lookup = buildGlyphLookup(pretext, {
      text: "hello",
      font: "16px sans",
      maxWidth: 200,
      lineHeight: 24,
    });
    // charStart=100 is way past the end.
    expect(lookup!.locate(100, 105)).toBeNull();
  });

  it("returns null for invalid range (charEnd <= charStart)", () => {
    const pretext = makeStubPretext({
      fullText: "hello",
      segments: ["hello"],
      lines: [
        { text: "hello", startSeg: 0, startGrapheme: 0, endSeg: 0, endGrapheme: 5 },
      ],
    });
    const lookup = buildGlyphLookup(pretext, {
      text: "hello",
      font: "16px sans",
      maxWidth: 200,
      lineHeight: 24,
    });
    expect(lookup!.locate(3, 3)).toBeNull();
    expect(lookup!.locate(5, 2)).toBeNull();
  });
});
