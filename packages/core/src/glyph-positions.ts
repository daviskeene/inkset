// Glyph-position lookup for reveal animations.
//
// Given a block's text plus its typography + container width, returns a
// GlyphPositionLookup whose `locate(charStart, charEnd)` answers "where on
// screen does this substring land?" in px relative to the block origin.
//
// The reveal layer uses these coords for two things:
//   1. Phase 3 — sort new tokens by (y, x) so multi-token ticks animate in
//      reading order instead of arrival order.
//   2. Phase 4 — hand coords to consumer-provided `RevealComponent` props so
//      particle trails / shader anchors / custom effects can align to the
//      exact visual position of each token.
//
// Both uses degrade gracefully: if pretext is unavailable (SSR, no Canvas,
// pretext failed to load) the helper returns null and the reveal layer falls
// back to arrival-order delays + hasCoords=false.

export interface TokenCoord {
  /** x offset in px within the block, from its left edge. */
  x: number;
  /** y offset in px within the block, top of the token's line. */
  y: number;
  /** Width of the token in px. */
  width: number;
  /** Height of the token's line (line-height) in px. */
  height: number;
  /** Zero-indexed line number within the block. */
  lineIndex: number;
}

export interface GlyphPositionLookup {
  /**
   * Resolve visual coords for the substring `[charStart, charEnd)` of the
   * block's text. Returns null when the range is invalid, spans nothing, or
   * lands outside what pretext laid out.
   */
  locate(charStart: number, charEnd: number): TokenCoord | null;
  /** Number of laid-out lines. Useful for consumers that need global geometry. */
  readonly lineCount: number;
}

export interface BuildGlyphLookupOptions {
  text: string;
  font: string;
  maxWidth: number;
  lineHeight: number;
}

// Subset of the @chenglou/pretext module we depend on. Typed loosely here so
// the core package doesn't grow a direct dependency on the pretext types; the
// full module shape lives in measure.ts.
export type GlyphPretextModule = {
  prepareWithSegments: (text: string, font: string, options?: unknown) => unknown;
  layoutWithLines: (
    prepared: unknown,
    maxWidth: number,
    lineHeight: number,
  ) => {
    lineCount: number;
    height: number;
    lines: Array<{
      text: string;
      width: number;
      start: { segmentIndex: number; graphemeIndex: number };
      end: { segmentIndex: number; graphemeIndex: number };
    }>;
  };
  measureNaturalWidth: (prepared: unknown) => number;
};

type LineSlice = {
  charStart: number;
  charEnd: number;
  y: number;
  lineText: string;
};

/**
 * Build a glyph-position lookup for the given block text + typography. Pure
 * (no side effects outside pretext's own cache). Pretext must already be
 * loaded; the caller gates on that.
 */
export const buildGlyphLookup = (
  pretext: GlyphPretextModule | null,
  options: BuildGlyphLookupOptions,
): GlyphPositionLookup | null => {
  if (!pretext || options.text.length === 0) return null;

  let prepared: unknown;
  let layoutResult: ReturnType<GlyphPretextModule["layoutWithLines"]>;
  try {
    prepared = pretext.prepareWithSegments(options.text, options.font);
    layoutResult = pretext.layoutWithLines(prepared, options.maxWidth, options.lineHeight);
  } catch {
    return null;
  }

  // Pretext's prepared-with-segments object carries a `segments: string[]`
  // alongside the branded text handle. Convert `segmentIndex + graphemeIndex`
  // cursors into absolute char offsets in the original text by tracking the
  // running segment length sum.
  const segments = (prepared as { segments?: string[] }).segments;
  if (!segments) return null;

  const segmentCharStart = new Array<number>(segments.length + 1);
  segmentCharStart[0] = 0;
  for (let i = 0; i < segments.length; i++) {
    segmentCharStart[i + 1] = segmentCharStart[i] + segments[i].length;
  }

  const cursorToChar = (cursor: { segmentIndex: number; graphemeIndex: number }): number => {
    const base = segmentCharStart[cursor.segmentIndex] ?? 0;
    return base + cursor.graphemeIndex;
  };

  const slices: LineSlice[] = layoutResult.lines.map((line, i) => ({
    charStart: cursorToChar(line.start),
    charEnd: cursorToChar(line.end),
    y: i * options.lineHeight,
    lineText: line.text,
  }));

  // Caches flat string → natural width to avoid re-preparing the same prefix
  // or token across ticks. Pretext's own prepare cache deduplicates too, but
  // avoiding the round-trip through dynamic dispatch is still a win for the
  // 40-tokens-per-tick burst case.
  const substrCache = new Map<string, number>();
  const measureSubstr = (text: string): number => {
    if (text.length === 0) return 0;
    const cached = substrCache.get(text);
    if (cached !== undefined) return cached;
    try {
      const sub = pretext.prepareWithSegments(text, options.font);
      const width = pretext.measureNaturalWidth(sub);
      substrCache.set(text, width);
      return width;
    } catch {
      return 0;
    }
  };

  const findLineIndex = (charPos: number): number => {
    if (slices.length === 0) return -1;
    // Binary search: first line whose charEnd > charPos. `charEnd` is
    // exclusive (past-the-end cursor), so a token at charPos === line.charEnd
    // belongs to the next line.
    let lo = 0;
    let hi = slices.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (slices[mid].charEnd <= charPos) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const locate = (charStart: number, charEnd: number): TokenCoord | null => {
    if (charEnd <= charStart) return null;
    const lineIdx = findLineIndex(charStart);
    if (lineIdx < 0) return null;
    const line = slices[lineIdx];
    if (!line) return null;
    if (charStart < line.charStart || charStart >= line.charEnd) return null;

    // Prefix/token are expressed in absolute char offsets; translate to
    // positions within the line's own text before slicing.
    const prefixEnd = charStart - line.charStart;
    // A token that straddles a line wrap terminates at line boundary — we
    // measure only its fragment on the *first* line (the one it anchors to
    // visually). The delay animation plays there; remaining characters on
    // the next line are considered part of the same token.
    const tokenEndLocal = Math.min(charEnd - line.charStart, line.charEnd - line.charStart);
    const prefixText = line.lineText.slice(0, prefixEnd);
    const tokenText = line.lineText.slice(prefixEnd, tokenEndLocal);

    const x = measureSubstr(prefixText);
    const width = measureSubstr(tokenText);

    return {
      x,
      y: line.y,
      width,
      height: options.lineHeight,
      lineIndex: lineIdx,
    };
  };

  return {
    locate,
    lineCount: slices.length,
  };
};
