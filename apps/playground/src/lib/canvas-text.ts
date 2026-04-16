// Canvas drawing helpers for the justification-comparison demo.
//
// Pretext gives us the line-break decisions; we render them ourselves with
// `ctx.fillText`. For full justification on non-last lines, we measure each
// word and distribute the extra space evenly across inter-word gaps.
import type { PreparedTextWithSegments } from "@chenglou/pretext";
import type { KnuthPlassLine } from "./knuth-plass";

type PretextInternals = {
  widths: number[];
  kinds: string[];
  lineEndFitAdvances: number[];
  discretionaryHyphenWidth: number;
  segments: string[];
};

export type RenderedLine = {
  text: string;
  naturalWidth: number;
  spaceCount: number;
  spaceStretch: number;
  endsWithSoftHyphen: boolean;
  isLast: boolean;
  /** For diagnostics: the ratio of slack to line width (negative if overfull). */
  stretchRatio: number;
};

export type RenderResult = {
  lines: RenderedLine[];
  avgStretchRatio: number;
  maxStretchRatio: number;
  stretchStdDev: number;
  /**
   * Lines where each space gap was stretched by more than
   * `RIVER_SPACE_MULTIPLIER` × the natural space width — a rough proxy for
   * visible rivers.
   */
  riverCount: number;
};

/** Space needs to bloat to more than 2.5× natural width before it reads as a river. */
const RIVER_SPACE_MULTIPLIER = 1.5;

/**
 * Materialises Pretext segments into drawable lines and computes justification
 * metrics. Pure function — the caller decides when to paint.
 */
export const materializeLines = (
  prepared: PreparedTextWithSegments,
  lines: KnuthPlassLine[],
  maxWidth: number,
): RenderResult => {
  const internals = prepared as unknown as PretextInternals;
  const { segments, kinds, widths, discretionaryHyphenWidth } = internals;

  const rendered: RenderedLine[] = lines.map((line) => {
    // Skip trailing space segments from the visible text — they get compressed
    // into the justified gap instead of being drawn.
    let endSeg = line.endSegment;
    while (endSeg > line.startSegment && kinds[endSeg - 1] === "space") {
      endSeg -= 1;
    }

    let naturalWidth = 0;
    let spaceCount = 0;
    const pieces: string[] = [];
    for (let i = line.startSegment; i < endSeg; i++) {
      const kind = kinds[i];
      if (kind === "soft-hyphen") continue;
      if (kind === "space") spaceCount += 1;
      pieces.push(segments[i]);
      naturalWidth += widths[i];
    }

    let text = pieces.join("");
    let renderedWidth = naturalWidth;
    if (line.endsWithSoftHyphen) {
      text += "-";
      renderedWidth += discretionaryHyphenWidth;
    }

    const slack = maxWidth - renderedWidth;
    const stretchRatio = maxWidth > 0 ? slack / maxWidth : 0;
    const spaceStretch =
      !line.isLast && spaceCount > 0 && slack > 0 ? slack / spaceCount : 0;

    return {
      text,
      naturalWidth: renderedWidth,
      spaceCount,
      spaceStretch,
      endsWithSoftHyphen: line.endsWithSoftHyphen,
      isLast: line.isLast,
      stretchRatio,
    };
  });

  // Natural space width for river detection (gap size in an unstretched line).
  let naturalSpaceWidth = 0;
  for (let i = 0; i < kinds.length; i++) {
    if (kinds[i] === "space") {
      naturalSpaceWidth = widths[i];
      break;
    }
  }

  const nonLast = rendered.filter((l) => !l.isLast);
  const avgStretchRatio =
    nonLast.length > 0
      ? nonLast.reduce((s, l) => s + Math.abs(l.stretchRatio), 0) / nonLast.length
      : 0;
  const maxStretchRatio =
    nonLast.length > 0 ? Math.max(...nonLast.map((l) => Math.abs(l.stretchRatio))) : 0;
  const meanRatio = avgStretchRatio;
  const stretchStdDev =
    nonLast.length > 0
      ? Math.sqrt(
          nonLast.reduce((s, l) => s + Math.pow(Math.abs(l.stretchRatio) - meanRatio, 2), 0) /
            nonLast.length,
        )
      : 0;
  const riverCount =
    naturalSpaceWidth > 0
      ? nonLast.filter(
          (l) => l.spaceCount > 0 && l.spaceStretch > naturalSpaceWidth * RIVER_SPACE_MULTIPLIER,
        ).length
      : 0;

  return { lines: rendered, avgStretchRatio, maxStretchRatio, stretchStdDev, riverCount };
};

/**
 * Paints justified lines onto a canvas. `font`/`baseline` must match the font
 * we passed to Pretext, otherwise widths drift.
 */
export const drawJustifiedLines = (
  ctx: CanvasRenderingContext2D,
  lines: RenderedLine[],
  options: {
    font: string;
    lineHeight: number;
    color: string;
    justify: boolean;
    top?: number;
  },
): void => {
  ctx.font = options.font;
  ctx.fillStyle = options.color;
  ctx.textBaseline = "alphabetic";

  const top = options.top ?? 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const y = top + options.lineHeight * (i + 1) - options.lineHeight * 0.25;

    if (!options.justify || line.isLast || line.spaceCount === 0 || line.spaceStretch === 0) {
      ctx.fillText(line.text, 0, y);
      continue;
    }

    // Walk words separated by single spaces, adding `spaceStretch` to each gap.
    let x = 0;
    const parts = splitPreservingSpaces(line.text);
    for (const part of parts) {
      if (part === " ") {
        x += ctx.measureText(" ").width + line.spaceStretch;
        continue;
      }
      ctx.fillText(part, x, y);
      x += ctx.measureText(part).width;
    }
  }
};

const splitPreservingSpaces = (text: string): string[] => {
  const out: string[] = [];
  let buf = "";
  for (const ch of text) {
    if (ch === " ") {
      if (buf) {
        out.push(buf);
        buf = "";
      }
      out.push(" ");
    } else {
      buf += ch;
    }
  }
  if (buf) out.push(buf);
  return out;
};
