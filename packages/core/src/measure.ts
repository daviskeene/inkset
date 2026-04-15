import type {
  Dimensions,
  EnrichedNode,
  MeasuredBlock,
  PreframePlugin,
} from "./types";
import type { PluginRegistry } from "./plugin";
import { extractText } from "./parse";

// ── LRU Cache ──────────────────────────────────────────────────────

interface CacheEntry {
  handle: unknown;
  lastAccessed: number;
}

export class LRUCache {
  private entries = new Map<string, CacheEntry>();
  private accessCounter = 0;

  constructor(private maxSize: number = 500) {}

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

export async function waitForFonts(): Promise<void> {
  if (fontsReady) return;

  if (typeof document !== "undefined" && document.fonts) {
    await document.fonts.ready;
  }
  fontsReady = true;
}

export function resetFontState(): void {
  fontsReady = false;
}

// ── Pretext integration ────────────────────────────────────────────

let pretextModule: PretextModule | null = null;

interface PretextModule {
  prepare: (text: string, font: string, options?: { fontSize?: number }) => unknown;
  layout: (
    prepared: unknown,
    maxWidth: number,
    lineHeight: number,
  ) => { height: number; lineCount: number };
}

async function getPretext(): Promise<PretextModule | null> {
  if (pretextModule) return pretextModule;

  try {
    pretextModule = (await import("@chenglou/pretext")) as PretextModule;
    return pretextModule;
  } catch {
    console.warn("[preframe] @chenglou/pretext not available. Using fallback measurement.");
    return null;
  }
}

// ── Measure layer ──────────────────────────────────────────────────

export interface MeasureOptions {
  font: string;
  fontSize: number;
  lineHeight: number;
  cacheSize?: number;
}

interface TypographySpec {
  font: string;
  fontSize: number;
  lineHeight: number;
}

const DEFAULT_OPTIONS: MeasureOptions = {
  font: "system-ui, sans-serif",
  fontSize: 16,
  lineHeight: 24,
  cacheSize: 500,
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
    plugin?: PreframePlugin,
  ): Promise<MeasuredBlock> {
    await this.init();

    // If a plugin provides measurement, use it
    if (plugin?.measure) {
      try {
        const dimensions = plugin.measure(node, maxWidth);
        return { blockId: node.blockId, node, dimensions };
      } catch (err) {
        console.warn(`[preframe] Plugin measure() failed for block ${node.blockId}:`, err);
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
   * Block-type-aware measurement. Accounts for headings being taller,
   * code blocks having monospace + header bars, lists having indent, etc.
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
        // Code blocks: monospace font (wider chars), plus header bar
        const lines = text.split("\n");
        const codeLineHeight = 21; // 14px * 1.5
        const headerHeight = 28;
        const padding = 24;
        return {
          width: maxWidth,
          height: lines.length * codeLineHeight + headerHeight + padding,
        };
      }

      case "table": {
        // Tables: estimate from row count
        const rows = (text.match(/\n/g) ?? []).length + 1;
        const rowHeight = 36;
        const headerHeight = 40;
        return {
          width: maxWidth,
          height: Math.max(rows * rowHeight + headerHeight, 80),
        };
      }

      case "list": {
        // Lists: each item gets its own line + indent
        const items = text.split("\n").filter((l) => l.trim());
        const itemHeight = this.options.lineHeight + 4;
        return {
          width: maxWidth,
          height: Math.max(items.length * itemHeight, this.options.lineHeight),
        };
      }

      case "blockquote": {
        // Blockquotes: same as text but with left padding
        return {
          width: maxWidth,
          height: baseDims.height + 16, // extra padding
        };
      }

      case "thematic-break": {
        return { width: maxWidth, height: 24 };
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

  /** Re-layout at a new width using the cached prepare() handle. */
  async relayout(
    measured: MeasuredBlock,
    newWidth: number,
    plugin?: PreframePlugin,
  ): Promise<Dimensions> {
    if (plugin?.measure) {
      try {
        return plugin.measure(measured.node, newWidth);
      } catch (err) {
        console.warn(
          `[preframe] Plugin measure() failed during relayout for block ${measured.blockId}:`,
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
      maxSize: this.options.cacheSize ?? 500,
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
    const avgCharWidth = fontSize * 0.6;
    const charsPerLine = Math.max(1, Math.floor(maxWidth / avgCharWidth));
    const lineCount = Math.max(1, Math.ceil(text.length / charsPerLine));
    return {
      width: maxWidth,
      height: lineCount * lineHeight,
    };
  }
}

function getHeadingLevel(node: EnrichedNode): number {
  const tag = node.tagName ?? node.children?.[0]?.tagName ?? "";
  const match = tag.match(/^h(\d)$/);
  return match ? parseInt(match[1], 10) : 1;
}

function buildFontShorthand(
  weight: number,
  fontSize: number,
  family: string,
): string {
  return `${weight} ${fontSize}px ${family}`;
}
