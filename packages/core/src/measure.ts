// Measure layer: text measurement via pretext with LRU caching and block-type-aware sizing.
import type {
  Dimensions,
  EnrichedNode,
  MeasuredBlock,
  InksetPlugin,
  HeadingSizeTuple,
  HeadingWeightTuple,
  HeadingLineHeightTuple,
  HeadingTrackingTuple,
} from "./types";
import { getNodeBlockKind } from "./block-spacing";
import { extractText } from "./parse";
import {
  buildGlyphLookup,
  type GlyphPositionLookup,
  type GlyphPretextModule,
} from "./glyph-positions";

// ── LRU Cache ──────────────────────────────────────────────────────

type CacheEntry = {
  handle: unknown;
  lastAccessed: number;
};

const LRU_DEFAULT_MAX_SIZE = 500;

// Block-type measurement constants, mirroring the default stylesheet in
// @inkset/react. Plugin chrome (code header bars, table toolbars) is the
// plugins' own business — see their `measure()`.
const LIST_INDENT_EM = 1.4; // --inkset-list-indent
const BLOCKQUOTE_BORDER_WIDTH = 3; // --inkset-blockquote-border-width (+ 1em padding)
const TABLE_ROW_CHROME = 4; // UA default: 1px cell padding ×2 + 2px border-spacing
// The default stylesheet renders <hr> as a 1px border with no margin.
const THEMATIC_BREAK_HEIGHT = 1;
const AVG_CHAR_WIDTH_RATIO = 0.6;
// Average glyph advance as a fraction of font size, used to translate
// letter-spacing into an equivalent measuring width.
const AVERAGE_GLYPH_EM = 0.5;

/**
 * Height for a block with no measurable text. Most such blocks (a scroll
 * anchor, an HTML comment, a bare definitions block) render nothing and take
 * no space. A thematic break draws a rule, so it keeps its 1px, and an
 * image-only paragraph reserves a line until the real image height is
 * observed — the layout drops the gap after zero-height blocks and must not
 * do that for either.
 */
const measureTextlessBlock = (
  node: EnrichedNode,
  maxWidth: number,
  lineHeight: number,
): Dimensions => {
  if (node.blockType === "thematic-break")
    return { width: maxWidth, height: THEMATIC_BREAK_HEIGHT };
  if (containsElement(node, "img")) return { width: maxWidth, height: lineHeight };
  return { width: maxWidth, height: 0 };
};

export class LRUCache {
  private entries = new Map<string, CacheEntry>();
  private accessCounter = 0;

  constructor(private maxSize: number = LRU_DEFAULT_MAX_SIZE) {}

  get(key: string): unknown | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    entry.lastAccessed = ++this.accessCounter;
    return entry.handle;
  }

  set(key: string, handle: unknown): void {
    if (this.entries.size >= this.maxSize) {
      this.evictOldest();
    }
    this.entries.set(key, {
      handle,
      lastAccessed: ++this.accessCounter,
    });
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  clear(): void {
    this.entries.clear();
    this.accessCounter = 0;
  }

  get size(): number {
    return this.entries.size;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.entries) {
      if (entry.lastAccessed < oldestAccess) {
        oldestAccess = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.entries.delete(oldestKey);
    }
  }
}

// ── Font loading ───────────────────────────────────────────────────

let fontsReady = false;

export const waitForFonts = async (): Promise<void> => {
  if (fontsReady) return;

  if (typeof document !== "undefined" && document.fonts) {
    await document.fonts.ready;
  }
  fontsReady = true;
};

export const resetFontState = (): void => {
  fontsReady = false;
};

// ── Pretext integration ────────────────────────────────────────────

let pretextModule: PretextModule | null = null;

type PretextModule = {
  prepare: (text: string, font: string, options?: { fontSize?: number }) => unknown;
  prepareWithSegments: (text: string, font: string, options?: { fontSize?: number }) => unknown;
  layout: (
    prepared: unknown,
    maxWidth: number,
    lineHeight: number,
  ) => { height: number; lineCount: number };
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
  measureLineStats: (
    prepared: unknown,
    maxWidth: number,
  ) => { lineCount: number; maxLineWidth: number };
  measureNaturalWidth: (prepared: unknown) => number;
};

const getPretext = async (): Promise<PretextModule | null> => {
  if (pretextModule) return pretextModule;

  try {
    pretextModule = (await import("@chenglou/pretext")) as PretextModule;
    return pretextModule;
  } catch (err: unknown) {
    console.warn("[inkset] @chenglou/pretext not available. Using fallback measurement.", err);
    return null;
  }
};

/**
 * Sync handle on the already-loaded pretext module, or null if the dynamic
 * import hasn't completed or the environment has no Canvas. Safe to call from
 * React render — callers that need pretext asynchronously should prefer
 * `getPretext()` internally to the core package.
 */
export const getPretextSync = (): PretextModule | null => pretextModule;

export type { PretextModule };

// Kick off the pretext dynamic-import the moment this module is evaluated,
// so the chunk is fetching (and usually resolved) before <Inkset> mounts
// and init() awaits it. Guarded for SSR — server bundles skip the fetch.
if (typeof window !== "undefined") {
  void getPretext();
}

// ── Measure layer ──────────────────────────────────────────────────

export type MeasureOptions = {
  font: string;
  fontSize: number;
  lineHeight: number;
  cacheSize?: number;
  headingSizes?: HeadingSizeTuple;
  headingWeights?: HeadingWeightTuple;
  headingLineHeights?: HeadingLineHeightTuple;
  headingTracking?: HeadingTrackingTuple;
};

type TypographySpec = {
  font: string;
  fontSize: number;
  lineHeight: number;
  /** CSS letter-spacing in px (negative tightens). Canvas cannot apply it. */
  letterSpacing?: number;
};

const DEFAULT_FONT_SIZE = 16;
const DEFAULT_LINE_HEIGHT = 24;

// Defaults chosen to preserve the historical hardcoded metrics (pre-Phase-3).
// Anyone touching these numbers is changing how much vertical space headings
// reserve in the layout, not just how they look — keep the CSS vars in
// `INKSET_STYLES` in sync with whatever the consumer passes.
export const DEFAULT_HEADING_SIZES: HeadingSizeTuple = [3, 2.15, 1.3, 1];
export const DEFAULT_HEADING_WEIGHTS: HeadingWeightTuple = [800, 780, 720, 680];
export const DEFAULT_HEADING_LINE_HEIGHTS: HeadingLineHeightTuple = [1.05, 1.08, 1.15, 1.2];
// Matches `--inkset-heading-N-tracking` in the default stylesheet (em).
export const DEFAULT_HEADING_TRACKING: HeadingTrackingTuple = [-0.04, -0.035, -0.02, 0];

const DEFAULT_OPTIONS: MeasureOptions = {
  font: "system-ui, sans-serif",
  fontSize: DEFAULT_FONT_SIZE,
  lineHeight: DEFAULT_LINE_HEIGHT,
  cacheSize: LRU_DEFAULT_MAX_SIZE,
  headingSizes: DEFAULT_HEADING_SIZES,
  headingWeights: DEFAULT_HEADING_WEIGHTS,
  headingLineHeights: DEFAULT_HEADING_LINE_HEIGHTS,
  headingTracking: DEFAULT_HEADING_TRACKING,
};

export class MeasureLayer {
  private cache: LRUCache;
  private options: MeasureOptions;
  private initialized = false;
  private pretextUnavailable = false;

  constructor(options?: Partial<MeasureOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.cache = new LRUCache(this.options.cacheSize);
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await Promise.all([waitForFonts(), getPretext()]);
    this.initialized = true;
  }

  async measureBlock(
    node: EnrichedNode,
    maxWidth: number,
    plugin?: InksetPlugin,
  ): Promise<MeasuredBlock> {
    await this.init();

    // If a plugin provides measurement, use it
    if (plugin?.measure) {
      try {
        const dimensions = plugin.measure(node, maxWidth);
        return { blockId: node.blockId, node, kind: getNodeBlockKind(node), dimensions };
      } catch (err) {
        console.warn(`[inkset] Plugin measure() failed for block ${node.blockId}:`, err);
      }
    }

    const text = extractText(node);
    if (!text) {
      return {
        blockId: node.blockId,
        node,
        kind: getNodeBlockKind(node),
        dimensions: measureTextlessBlock(node, maxWidth, this.options.lineHeight),
      };
    }

    // Use block-type-aware measurement
    const dimensions = await this.measureBlockByType(node, text, maxWidth);
    return { blockId: node.blockId, node, kind: getNodeBlockKind(node), dimensions };
  }

  /**
   * Block-type-aware sizing so pretext can approximate the default
   * stylesheet's layout without DOM access. Plugin-rendered blocks never get
   * here (their `measure()` runs first), so the code and table cases model
   * the *default* renderer — a bare `<pre>` or a UA-styled `<table>` in the
   * base font — not the plugins' chrome.
   */
  private async measureBlockByType(
    node: EnrichedNode,
    text: string,
    maxWidth: number,
  ): Promise<Dimensions> {
    const baseTypography = this.getBaseTypography();

    switch (node.blockType) {
      case "heading": {
        return this.measureTextWithTypography(
          text,
          maxWidth,
          this.getHeadingTypography(getHeadingLevel(node)),
        );
      }

      case "code": {
        // One line per source line; remark's trailing newline adds none.
        const lines = text.replace(/\n$/, "").split("\n").length;
        return { width: maxWidth, height: lines * this.options.lineHeight };
      }

      case "table": {
        // Count rows in the tree: the text contains a newline per cell.
        const rows = Math.max(1, countElements(node, "tr"));
        return { width: maxWidth, height: rows * (this.options.lineHeight + TABLE_ROW_CHROME) };
      }

      case "list": {
        const height = await this.measureListContainer(node, maxWidth, baseTypography);
        return { width: maxWidth, height: Math.max(height, this.options.lineHeight) };
      }

      case "blockquote": {
        // The stylesheet narrows the text column by `padding-left: 1em` plus
        // the border; it adds no vertical padding.
        const innerWidth = Math.max(
          1,
          maxWidth - (this.options.fontSize + BLOCKQUOTE_BORDER_WIDTH),
        );
        const dims = await this.measureTextWithTypography(text, innerWidth, baseTypography);
        return { width: maxWidth, height: dims.height };
      }

      case "thematic-break": {
        return { width: maxWidth, height: THEMATIC_BREAK_HEIGHT };
      }

      default:
        return this.measureTextWithTypography(text, maxWidth, baseTypography);
    }
  }

  /**
   * Sums list items the way the DOM lays them out: each `<li>` wraps inside
   * the list's indent, nested lists indent again, and soft line breaks inside
   * an item collapse to spaces rather than starting a new bullet.
   */
  private async measureListContainer(
    node: EnrichedNode,
    width: number,
    typography: TypographySpec,
  ): Promise<number> {
    const indent = this.options.fontSize * LIST_INDENT_EM;
    let total = 0;

    for (const child of node.children ?? []) {
      if (child.type !== "element") continue;

      if (child.tagName === "ul" || child.tagName === "ol") {
        total += await this.measureListContainer(child, Math.max(1, width - indent), typography);
        continue;
      }

      if (child.tagName !== "li") {
        total += await this.measureListContainer(child, width, typography);
        continue;
      }

      // Own content first (each paragraph of a loose item is its own box),
      // then nested lists one indent deeper.
      let run = "";
      const flushRun = async () => {
        const text = run.trim();
        run = "";
        if (text) total += (await this.measureTextWithTypography(text, width, typography)).height;
      };
      for (const part of child.children ?? []) {
        if (part.tagName === "ul" || part.tagName === "ol") {
          await flushRun();
          total += await this.measureListContainer(part, Math.max(1, width - indent), typography);
        } else if (part.tagName === "p") {
          await flushRun();
          run = extractText(part);
          await flushRun();
        } else {
          run += extractText(part);
        }
      }
      await flushRun();
    }

    return total;
  }

  async measureText(text: string, maxWidth: number): Promise<Dimensions> {
    return this.measureTextWithTypography(text, maxWidth, this.getBaseTypography());
  }

  /**
   * Returns the narrowest container width at which `text` still greedy-wraps
   * into the same number of lines it would at `maxWidth`. Equivalent to
   * "shrinkwrap" in pretext terms: the visual effect is a paragraph whose
   * right edge hugs the longest line, eliminating trailing whitespace on
   * short final lines. When pretext is unavailable (e.g. SSR / Node tests
   * without Canvas) this returns `null` so the caller can fall back to the
   * full container width.
   *
   * @param headingLevel 1..4 when measuring headings so the typography
   *   matches what `getHeadingTypography` uses; omit for body text.
   */
  async measureShrinkwrapWidth(
    text: string,
    maxWidth: number,
    headingLevel?: number,
  ): Promise<{ width: number; lineCount: number } | null> {
    await this.init();
    if (!text) return null;

    const pretext = await getPretext();
    if (!pretext || this.pretextUnavailable) return null;
    if (!pretext.measureLineStats || !pretext.prepareWithSegments) return null;

    const typography = headingLevel
      ? this.getHeadingTypography(headingLevel)
      : this.getBaseTypography();

    try {
      const prepared = pretext.prepareWithSegments(text, typography.font);
      const stats = pretext.measureLineStats(prepared, maxWidth);
      if (stats.lineCount <= 1) {
        // One-line content is already balanced: return its natural width so
        // callers can still opt to shrink the container.
        return { width: stats.maxLineWidth, lineCount: 1 };
      }
      return { width: Math.ceil(stats.maxLineWidth), lineCount: stats.lineCount };
    } catch (err) {
      this.pretextUnavailable = true;
      console.warn("[inkset] pretext shrinkwrap failed:", err);
      return null;
    }
  }

  private async measureTextWithTypography(
    text: string,
    maxWidth: number,
    typography: TypographySpec,
  ): Promise<Dimensions> {
    const pretext = await getPretext();

    if (!pretext || this.pretextUnavailable) {
      return this.fallbackMeasure(text, maxWidth, typography);
    }

    const cacheKey = `${text}|${typography.font}`;
    let handle = this.cache.get(cacheKey);

    try {
      if (!handle) {
        handle = pretext.prepare(text, typography.font);
        this.cache.set(cacheKey, handle);
      }
      const result = pretext.layout(
        handle,
        compensateLetterSpacing(maxWidth, typography),
        typography.lineHeight,
      );
      // Whole pixels: the DOM reports integer heights and fractional `y`s
      // would put every following block on a sub-pixel boundary.
      return {
        width: maxWidth,
        height: Math.ceil(result.height),
      };
    } catch (err) {
      // Pretext throws when Canvas/OffscreenCanvas isn't available (SSR, Node tests).
      // Latch the flag so subsequent calls skip the try/catch overhead.
      this.pretextUnavailable = true;
      console.warn(
        "[inkset] pretext measurement failed; falling back to character-width estimate:",
        err,
      );
      return this.fallbackMeasure(text, maxWidth, typography);
    }
  }

  async relayout(
    measured: MeasuredBlock,
    newWidth: number,
    plugin?: InksetPlugin,
  ): Promise<Dimensions> {
    if (plugin?.measure) {
      try {
        return plugin.measure(measured.node, newWidth);
      } catch (err) {
        console.warn(
          `[inkset] Plugin measure() failed during relayout for block ${measured.blockId}:`,
          err,
        );
      }
    }

    const text = extractText(measured.node);
    if (!text) return measureTextlessBlock(measured.node, newWidth, this.options.lineHeight);

    return this.measureBlockByType(measured.node, text, newWidth);
  }

  get cacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.options.cacheSize ?? LRU_DEFAULT_MAX_SIZE,
    };
  }

  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Build a glyph-position lookup for the given block node at the given
   * container width. Returns null when pretext is unavailable (SSR, import
   * failed) — callers must gracefully fall back to arrival-order behaviour.
   *
   * Sync because pretext is loaded lazily at module evaluation and by the
   * time a block is being rendered (pipeline has emitted state) the module
   * is guaranteed ready. The render hot path can call this without waiting.
   */
  buildGlyphLookupForBlock(node: EnrichedNode, maxWidth: number): GlyphPositionLookup | null {
    if (!pretextModule || this.pretextUnavailable) return null;
    const text = extractText(node);
    if (!text) return null;

    const typography =
      node.blockType === "heading"
        ? this.getHeadingTypography(getHeadingLevel(node))
        : this.getBaseTypography();

    return buildGlyphLookup(pretextModule as unknown as GlyphPretextModule, {
      text,
      font: typography.font,
      maxWidth,
      lineHeight: typography.lineHeight,
    });
  }

  private getBaseTypography(): TypographySpec {
    return {
      font: buildFontShorthand(400, this.options.fontSize, this.options.font),
      fontSize: this.options.fontSize,
      lineHeight: this.options.lineHeight,
    };
  }

  private getHeadingTypography(level: number): TypographySpec {
    const base = this.options.fontSize;
    const sizes = this.options.headingSizes ?? DEFAULT_HEADING_SIZES;
    const weights = this.options.headingWeights ?? DEFAULT_HEADING_WEIGHTS;
    const lineHeights = this.options.headingLineHeights ?? DEFAULT_HEADING_LINE_HEIGHTS;

    // h1..h4 are explicit; h5/h6 (and anything higher) inherit h4.
    const idx = Math.max(0, Math.min(3, level - 1));
    const fontSize = base * sizes[idx];
    const tracking = this.options.headingTracking ?? DEFAULT_HEADING_TRACKING;

    return {
      font: buildFontShorthand(weights[idx], fontSize, this.options.font),
      fontSize,
      lineHeight: fontSize * lineHeights[idx],
      letterSpacing: fontSize * tracking[idx],
    };
  }

  private fallbackMeasure(text: string, maxWidth: number, typography: TypographySpec): Dimensions {
    const avgCharWidth = typography.fontSize * AVG_CHAR_WIDTH_RATIO;
    const layoutWidth = compensateLetterSpacing(maxWidth, typography);
    const charsPerLine = Math.max(1, Math.floor(layoutWidth / avgCharWidth));
    const lineCount = Math.max(1, Math.ceil(text.length / charsPerLine));
    return {
      width: maxWidth,
      height: Math.ceil(lineCount * typography.lineHeight),
    };
  }
}

/**
 * Canvas measurement has no letter-spacing, but the default stylesheet tracks
 * h1–h3 tighter (`-0.04em` on h1). Every glyph the DOM draws is `letterSpacing`
 * narrower than pretext thinks, so a line holds more of them: measure at a
 * proportionally wider width instead of wrapping one line too early.
 */
const compensateLetterSpacing = (maxWidth: number, typography: TypographySpec): number => {
  const letterSpacing = typography.letterSpacing ?? 0;
  if (letterSpacing === 0) return maxWidth;
  const averageGlyph = typography.fontSize * AVERAGE_GLYPH_EM;
  return maxWidth / Math.max(0.5, 1 + letterSpacing / averageGlyph);
};

const countElements = (node: EnrichedNode, tagName: string): number => {
  let count = node.type === "element" && node.tagName === tagName ? 1 : 0;
  for (const child of node.children ?? []) count += countElements(child, tagName);
  return count;
};

const containsElement = (node: EnrichedNode, tagName: string): boolean =>
  countElements(node, tagName) > 0;

const getHeadingLevel = (node: EnrichedNode): number => {
  const tag = node.tagName ?? node.children?.[0]?.tagName ?? "";
  const match = tag.match(/^h(\d)$/);
  return match ? parseInt(match[1], 10) : 1;
};

const buildFontShorthand = (weight: number, fontSize: number, family: string): string => {
  return `${weight} ${fontSize}px ${family}`;
};
