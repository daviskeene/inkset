import type {
  Dimensions,
  EnrichedNode,
  MeasuredBlock,
  PreframePlugin,
} from "./types.js";
import type { PluginRegistry } from "./plugin.js";
import { extractText } from "./parse.js";

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

/**
 * Wait for fonts to load before measuring.
 * Uses document.fonts.ready to ensure Canvas measureText() uses the correct font.
 */
export async function waitForFonts(): Promise<void> {
  if (fontsReady) return;

  if (typeof document !== "undefined" && document.fonts) {
    await document.fonts.ready;
  }
  fontsReady = true;
}

/** Reset font ready state (for testing) */
export function resetFontState(): void {
  fontsReady = false;
}

// ── Pretext integration ────────────────────────────────────────────

// Dynamic import for pretext to avoid SSR issues
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

  /** Initialize the measure layer (wait for fonts + load pretext) */
  async init(): Promise<void> {
    if (this.initialized) return;
    await Promise.all([waitForFonts(), getPretext()]);
    this.initialized = true;
  }

  /**
   * Measure a block using pretext for text, or plugin.measure() for enriched content.
   */
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
        // Fall through to text measurement
      }
    }

    // Default: extract text and measure with pretext
    const text = extractText(node);
    if (!text) {
      return {
        blockId: node.blockId,
        node,
        dimensions: { width: maxWidth, height: 0 },
      };
    }

    const dimensions = await this.measureText(text, maxWidth);
    return { blockId: node.blockId, node, dimensions };
  }

  /**
   * Measure text using pretext's prepare()/layout() split.
   * Caches prepare() handles in the LRU cache.
   */
  async measureText(text: string, maxWidth: number): Promise<Dimensions> {
    const pretext = await getPretext();

    if (!pretext) {
      // Fallback: estimate dimensions without pretext
      return this.fallbackMeasure(text, maxWidth);
    }

    const cacheKey = `${text}|${this.options.font}|${this.options.fontSize}`;
    let handle = this.cache.get(cacheKey);

    if (!handle) {
      handle = pretext.prepare(text, this.options.font, {
        fontSize: this.options.fontSize,
      });
      this.cache.set(cacheKey, handle);
    }

    const result = pretext.layout(handle, maxWidth, this.options.lineHeight);
    return {
      width: maxWidth,
      height: result.height,
    };
  }

  /**
   * Re-layout a previously measured block at a new width.
   * Uses the cached prepare() handle — pure arithmetic, no re-measurement.
   */
  async relayout(
    measured: MeasuredBlock,
    newWidth: number,
  ): Promise<Dimensions> {
    const text = extractText(measured.node);
    if (!text) return { width: newWidth, height: 0 };

    const pretext = await getPretext();
    if (!pretext) return this.fallbackMeasure(text, newWidth);

    const cacheKey = `${text}|${this.options.font}|${this.options.fontSize}`;
    const handle = this.cache.get(cacheKey);

    if (!handle) {
      // Cache miss — need to re-prepare
      return this.measureText(text, newWidth);
    }

    const result = pretext.layout(handle, newWidth, this.options.lineHeight);
    return { width: newWidth, height: result.height };
  }

  /** Get cache stats for the DevTools overlay */
  get cacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.options.cacheSize ?? 500,
    };
  }

  /** Clear the measurement cache */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Fallback measurement when pretext is not available.
   * Estimates height based on character count and line width.
   */
  private fallbackMeasure(text: string, maxWidth: number): Dimensions {
    const avgCharWidth = this.options.fontSize * 0.6;
    const charsPerLine = Math.max(1, Math.floor(maxWidth / avgCharWidth));
    const lineCount = Math.max(1, Math.ceil(text.length / charsPerLine));
    return {
      width: maxWidth,
      height: lineCount * this.options.lineHeight,
    };
  }
}
