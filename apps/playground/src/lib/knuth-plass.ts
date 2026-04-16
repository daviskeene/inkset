// Knuth-Plass-style line breaker layered on Pretext's segment output.
//
// Pretext gives us per-segment widths + kinds + `lineEndFitAdvances` (the
// adjustment to apply when a line ends at a given segment: 0 for a trailing
// space, the hyphen-width for a soft-hyphen, the segment width for text).
// We DP over candidate break points to find the sequence of breaks with the
// smallest total "badness" (squared relative slack, plus a small penalty for
// breaking at soft hyphens).
import type { PreparedTextWithSegments } from "@chenglou/pretext";

// Pretext's public type brands these internals as opaque. At runtime the
// object carries all the fields below — we just need TypeScript to let us read
// them. Mirrors the shape in @chenglou/pretext/dist/layout.js.
type PretextInternals = {
  widths: number[];
  kinds: string[];
  lineEndFitAdvances: number[];
  discretionaryHyphenWidth: number;
  segments: string[];
};

export type BreakKind = "start" | "space" | "soft-hyphen" | "hard-break" | "end";

export type LineBreak = {
  /** Segment index immediately after this break (start of the next line). */
  segmentIndex: number;
  kind: BreakKind;
};

export type KnuthPlassLine = {
  startSegment: number;
  endSegment: number; // exclusive
  fitWidth: number;
  endsWithSoftHyphen: boolean;
  isLast: boolean;
};

export type KnuthPlassLayout = {
  lines: KnuthPlassLine[];
  totalBadness: number;
};

// Calibrated against the badness scale below (ratio² × 100): a 15% slack line
// scores 2.25, so HYPHEN_PENALTY=2 makes a hyphen slightly preferable to that
// much stretch. Higher values caused K-P to avoid hyphenation entirely, which
// defeats the whole point at narrow column widths.
const HYPHEN_PENALTY = 2;
/** Ratios above this count as overfull and are heavily discouraged. */
const TOLERANCE = 1.15;
const OVERFULL_BADNESS = 1e6;

/**
 * Minimum-badness line breaking over a Pretext-prepared paragraph.
 *
 * @param prepared Result of `prepareWithSegments(...)`
 * @param maxWidth Target line width in px
 */
export function knuthPlassLayout(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
): KnuthPlassLayout {
  const internals = prepared as unknown as PretextInternals;
  const { widths, kinds, lineEndFitAdvances } = internals;
  const n = widths.length;

  if (n === 0) {
    return { lines: [], totalBadness: 0 };
  }

  // Prefix-sum of widths so a line's width can be computed in O(1).
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    prefix[i + 1] = prefix[i] + widths[i];
  }

  // Break indices are positions BETWEEN segments.
  // Index 0 = before seg 0; index n = after seg n-1.
  // A line from break j to break k covers segments [j, k-1].
  // A break at k is valid when segment k-1 is a breakable kind (or k === n).
  const isBreakable = (k: number): boolean => {
    if (k === n) return true;
    if (k === 0) return true;
    const kind = kinds[k - 1];
    return kind === "space" || kind === "soft-hyphen" || kind === "hard-break" || kind === "zero-width-break";
  };

  /** fit-width of the line covering segments [j, k-1]. */
  const lineWidth = (j: number, k: number): number => {
    // Sum of widths over [j, k-1] = prefix[k] - prefix[j]
    // Minus the last segment's width (since lineEndFitAdvances replaces it
    // with the fit-end adjustment: 0 for space, hyphen for soft-hyphen, width
    // for text).
    const last = k - 1;
    return prefix[k] - prefix[j] - widths[last] + lineEndFitAdvances[last];
  };

  const cost = new Float64Array(n + 1);
  const prev = new Int32Array(n + 1);
  cost.fill(Infinity);
  cost[0] = 0;
  prev[0] = -1;

  for (let k = 1; k <= n; k++) {
    if (!isBreakable(k)) continue;

    for (let j = 0; j < k; j++) {
      if (!Number.isFinite(cost[j])) continue;
      if (!isBreakable(j)) continue;
      if (j > 0 && !Number.isFinite(cost[j])) continue;

      const width = lineWidth(j, k);
      if (width > maxWidth * TOLERANCE) {
        // Any further j would only make the line wider or comparable — but
        // since we iterate j bottom-up, once we overflow we can try fewer
        // starting segments. However, j is the *earlier* break, so larger j
        // means a *shorter* line. Don't break out; just skip.
        continue;
      }

      const isLast = k === n;
      const softHyphen = kinds[k - 1] === "soft-hyphen";

      let badness: number;
      if (width > maxWidth) {
        const ratio = (width - maxWidth) / maxWidth;
        badness = OVERFULL_BADNESS + ratio * ratio * 1000;
      } else if (isLast) {
        badness = 0;
      } else {
        const ratio = (maxWidth - width) / maxWidth;
        badness = ratio * ratio * 100;
      }

      if (softHyphen) badness += HYPHEN_PENALTY;

      const total = cost[j] + badness;
      if (total < cost[k]) {
        cost[k] = total;
        prev[k] = j;
      }
    }
  }

  // Recover the line sequence from the breadcrumbs.
  const reverse: Array<{ j: number; k: number }> = [];
  let cur = n;
  while (cur > 0 && prev[cur] >= 0) {
    reverse.push({ j: prev[cur], k: cur });
    cur = prev[cur];
  }
  if (cur !== 0) {
    // DP failed to reach the start — fall back to a single overfull line so
    // callers still get something sensible.
    return {
      lines: [
        {
          startSegment: 0,
          endSegment: n,
          fitWidth: lineWidth(0, n),
          endsWithSoftHyphen: n > 0 && kinds[n - 1] === "soft-hyphen",
          isLast: true,
        },
      ],
      totalBadness: Infinity,
    };
  }

  reverse.reverse();
  const lines: KnuthPlassLine[] = reverse.map(({ j, k }, idx) => ({
    startSegment: j,
    endSegment: k,
    fitWidth: lineWidth(j, k),
    endsWithSoftHyphen: k > 0 && k <= n && kinds[k - 1] === "soft-hyphen",
    isLast: idx === reverse.length - 1,
  }));

  return { lines, totalBadness: cost[n] };
}
