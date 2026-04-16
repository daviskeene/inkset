// Measure layer: text measurement via pretext with LRU caching and block-type-aware sizing.
import type {
  Dimensions,
  EnrichedNode,
  MeasuredBlock,
  InksetPlugin,
} from "./types";
import type { PluginRegistry } from "./plugin";
import { extractText } from "./parse";

// ── LRU Cache ──────────────────────────────────────────────────────

type CacheEntry = {
  handle: unknown;
  lastAccessed: number;
};

const LRU_DEFAULT_MAX_SIZE = 500;

// Block-type measurement constants
const CODE_LINE_HEIGHT = 21; // 14px font * 1.5 line-height
const CODE_HEADER_HEIGHT = 28;
const CODE_PADDING = 24;
const TABLE_ROW_HEIGHT = 36;
const TABLE_HEADER_HEIGHT = 40;
const TABLE_MIN_HEIGHT = 80;
const LIST_ITEM_PADDING = 4;
const BLOCKQUOTE_EXTRA_PADDING = 16;
const THEMATIC_BREAK_HEIGHT = 24;
const AVG_CHAR_WIDTH_RATIO = 0.6;

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
  layout: (
    prepared: unknown,
    maxWidth: number,
    lineHeight: number,
  ) => { height: number; lineCount: number };
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

// ── Measure layer ──────────────────────────────────────────────────

export type MeasureOptions = {
  font: string;
  fontSize: number;
  lineHeight: number;
  cacheSize?: number;
};

type TypographySpec = {
  font: string;
  fontSize: number;
  lineHeight: number;
};

const DEFAULT_FONT_SIZE = 16;
const DEFAULT_LINE_HEIGHT = 24;

const DEFAULT_OPTIONS: MeasureOptions = {
  font: "system-ui, sans-serif",
  fontSize: DEFAULT_FONT_SIZE,
  lineHeight: DEFAULT_LINE_HEIGHT,
  cacheSize: LRU_DEFAULT_MAX_SIZE,
};

export class MeasureLayer {
  private cache: LRUCache;
  private options: MeasureOptions;
  private initialized = false;

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
        return { blockId: node.blockId, node, dimensions };
      } catch (err) {
        console.warn(`[inkset] Plugin measure() failed for block ${node.blockId}:`, err);
      }
    }

    const text = extractText(node);
    if (!text) {
      return {
        blockId: node.blockId,
        node,
        dimensions: { width: maxWidth, height: 0 },
      };
    }

    // Use block-type-aware measurement
    const dimensions = await this.measureBlockByType(node, text, maxWidth);
    return { blockId: node.blockId, node, dimensions };
  }

  /**
   * Accounts for headings being taller, code blocks having monospace + header
   * bars, lists having indent, etc. Each block type uses a different sizing
   * heuristic so pretext can approximate layout without DOM access.
   */
  private async measureBlockByType(
    node: EnrichedNode,
    text: string,
    maxWidth: number,
  ): Promise<Dimensions> {
    const baseTypography = this.getBaseTypography();
    const baseDims = await this.measureTextWithTypography(
      text,
      maxWidth,
      baseTypography,
    );

    switch (node.blockType) {
      case "heading": {
        return this.measureTextWithTypography(
          text,
          maxWidth,
          this.getHeadingTypography(getHeadingLevel(node)),
        );
      }

      case "code": {
        const lines = text.split("\n");
        return {
          width: maxWidth,
          height: lines.length * CODE_LINE_HEIGHT + CODE_HEADER_HEIGHT + CODE_PADDING,
        };
      }

      case "table": {
        const rows = (text.match(/\n/g) ?? []).length + 1;
        return {
          width: maxWidth,
          height: Math.max(rows * TABLE_ROW_HEIGHT + TABLE_HEADER_HEIGHT, TABLE_MIN_HEIGHT),
        };
      }

      case "list": {
        const items = text.split("\n").filter((l) => l.trim());
        const itemHeight = this.options.lineHeight + LIST_ITEM_PADDING;
        return {
          width: maxWidth,
          height: Math.max(items.length * itemHeight, this.options.lineHeight),
        };
      }

      case "blockquote": {
        return {
          width: maxWidth,
          height: baseDims.height + BLOCKQUOTE_EXTRA_PADDING,
        };
      }

      case "thematic-break": {
        return { width: maxWidth, height: THEMATIC_BREAK_HEIGHT };
      }

      default:
        return baseDims;
    }
  }

  async measureText(text: string, maxWidth: number): Promise<Dimensions> {
    return this.measureTextWithTypography(
      text,
      maxWidth,
      this.getBaseTypography(),
    );
  }

  private async measureTextWithTypography(
    text: string,
    maxWidth: number,
    typography: TypographySpec,
  ): Promise<Dimensions> {
    const pretext = await getPretext();

    if (!pretext) {
      return this.fallbackMeasure(
        text,
        maxWidth,
        typography.fontSize,
        typography.lineHeight,
      );
    }

    const cacheKey = `${text}|${typography.font}`;
    let handle = this.cache.get(cacheKey);

    if (!handle) {
      handle = pretext.prepare(text, typography.font);
      this.cache.set(cacheKey, handle);
    }

    const result = pretext.layout(handle, maxWidth, typography.lineHeight);
    return {
      width: maxWidth,
      height: result.height,
    };
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
    if (!text) return { width: newWidth, height: 0 };

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

  private getBaseTypography(): TypographySpec {
    return {
      font: buildFontShorthand(400, this.options.fontSize, this.options.font),
      fontSize: this.options.fontSize,
      lineHeight: this.options.lineHeight,
    };
  }

  private getHeadingTypography(level: number): TypographySpec {
    const base = this.options.fontSize;

    if (level === 1) {
      const fontSize = base * 3;
      return {
        font: buildFontShorthand(800, fontSize, this.options.font),
        fontSize,
        lineHeight: fontSize * 1.05,
      };
    }

    if (level === 2) {
      const fontSize = base * 2.15;
      return {
        font: buildFontShorthand(780, fontSize, this.options.font),
        fontSize,
        lineHeight: fontSize * 1.08,
      };
    }

    if (level === 3) {
      const fontSize = base * 1.3;
      return {
        font: buildFontShorthand(720, fontSize, this.options.font),
        fontSize,
        lineHeight: fontSize * 1.15,
      };
    }

    const fontSize = base;
    return {
      font: buildFontShorthand(680, fontSize, this.options.font),
      fontSize,
      lineHeight: fontSize * 1.2,
    };
  }

  private fallbackMeasure(
    text: string,
    maxWidth: number,
    fontSize: number = this.options.fontSize,
    lineHeight: number = this.options.lineHeight,
  ): Dimensions {
    const avgCharWidth = fontSize * AVG_CHAR_WIDTH_RATIO;
    const charsPerLine = Math.max(1, Math.floor(maxWidth / avgCharWidth));
    const lineCount = Math.max(1, Math.ceil(text.length / charsPerLine));
    return {
      width: maxWidth,
      height: lineCount * lineHeight,
    };
  }
}

const getHeadingLevel = (node: EnrichedNode): number => {
  const tag = node.tagName ?? node.children?.[0]?.tagName ?? "";
  const match = tag.match(/^h(\d)$/);
  return match ? parseInt(match[1], 10) : 1;
};

const buildFontShorthand = (
  weight: number,
  fontSize: number,
  family: string,
): string => {
  return `${weight} ${fontSize}px ${family}`;
};
