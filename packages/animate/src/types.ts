// Public types for @inkset/animate.
import type { ComponentType, ReactNode } from "react";

export type ChunkingMode = "word" | "char";

export interface ThrottleOptions {
  /** Milliseconds between emissions. Default 30. Set to 0 for no delay. */
  delayInMs?: number;
  /** Chunking boundary. Word defers emission to whitespace; char emits per codepoint. */
  chunking?: ChunkingMode;
}

export type AnimationPreset = "fadeIn" | "blurIn" | "slideUp";
export type ShaderOptions = Record<string, unknown>;

export interface ShaderToken {
  /** x offset in px within the Inkset root. */
  x: number;
  /** y offset in px within the Inkset root. */
  y: number;
  /** Token width in px. */
  width: number;
  /** Token line height in px. */
  height: number;
  /** Animation-delay assigned to the token, in ms. */
  delayMs: number;
  /** Animation duration assigned to the token, in ms. */
  durationMs: number;
  /** Pipeline tick that produced this token. */
  tickId: number;
  /** 0-indexed reveal order position within the tick. */
  tokenIndex: number;
  /** The block that owns this token. */
  blockId: number;
}

export interface ShaderInitOptions {
  /** Overlay canvas owned by the React renderer. */
  canvas: HTMLCanvasElement;
  /** Device pixel ratio used to size the canvas backing store. */
  dpr: number;
  /** Optional preset-specific configuration from `reveal.shader`. */
  options?: ShaderOptions;
}

export interface ShaderInstance {
  /** Emit the fresh token rects for the current tick. */
  emit(tokens: ShaderToken[]): void;
  /** Tear down any RAF loops and clear internal state. */
  dispose(): void;
}

export interface ShaderPreset {
  /** Registry name, e.g. "ink-bleed". */
  name: string;
  /** Initialize against the root container + overlay canvas. */
  init(container: HTMLElement, options: ShaderInitOptions): Promise<ShaderInstance>;
}

export type ShaderLoader = () => Promise<ShaderPreset>;
export type ShaderConfig =
  | string
  | {
      preset: string;
      options?: ShaderOptions;
    };

/**
 * Order in which new tokens within a single tick animate in.
 *
 * - `"layout"` (default): sort by pretext-computed (y, x), so multi-token
 *   ticks reveal top-to-bottom, left-to-right in reading order. Needs
 *   pretext + canvas; falls back to `"arrival"` transparently when the
 *   coord lookup is unavailable.
 * - `"arrival"`: delay = arrivalIndex × stagger. The classic "cursor-follows-
 *   LLM" feel, good for short single-line bursts or consumers who have
 *   muscle memory for the ChatGPT look.
 */
export type StaggerOrder = "layout" | "arrival";

export interface AnimateOptions {
  /** Built-in preset name or a custom `@keyframes` name. Default "fadeIn". */
  preset?: AnimationPreset | string;
  /** Animation duration in ms. Default 320. */
  duration?: number;
  /** CSS timing function. Default "cubic-bezier(.2,.8,.2,1)". */
  easing?: string;
  /** Per-token stagger step in ms. Default 30. */
  stagger?: number;
  /** Split unit. Default "word". */
  sep?: ChunkingMode;
  /**
   * Ordering policy for the stagger. Default `"layout"`. `"arrival"` restores
   * the pre-Phase-3 behaviour (delay follows token arrival index).
   */
  staggerOrder?: StaggerOrder;
  /**
   * Cap on the total stagger span across all new tokens in one tick (ms).
   * Default 400. Prevents big bursts (40+ tokens) from feeling like lag.
   * Set to 0 to disable the clamp and let stagger × N span unbounded.
   */
  maxStaggerSpanMs?: number;
}

/**
 * Props passed to a consumer-provided `RevealComponent`. The component renders
 * in place of the default `<span data-inkset-reveal-token>`; it receives the
 * token text via `children` plus position/timing metadata so it can anchor
 * particle systems, canvas overlays, or custom entrance animations to the
 * exact visual position of each token.
 *
 * The default reveal CSS does NOT apply to custom components — they own their
 * own animation. Use `delayMs` and `durationMs` to drive whatever you like.
 */
export interface RevealComponentProps {
  /** The literal token text (no surrounding whitespace). */
  token: string;
  /** Default-rendered content (plain text). Render to keep the baseline content. */
  children: ReactNode;
  /** x offset in px within the block. 0 when `hasCoords` is false. */
  x: number;
  /** y offset in px within the block (top of the token's line). 0 when `hasCoords` is false. */
  y: number;
  /** Token width in px. 0 when `hasCoords` is false. */
  width: number;
  /** Line height in px. 0 when `hasCoords` is false. */
  height: number;
  /** Animation-delay the default renderer would have applied, in ms. */
  delayMs: number;
  /** Animation duration, in ms (forwarded from AnimateOptions.duration). */
  durationMs: number;
  /** Pipeline tick that produced this token. Combine with `tokenIndex` for stable keys. */
  tickId: number;
  /** 0-indexed position of this token within `tickId`, after layout sort. */
  tokenIndex: number;
  /** The block that owns this token. */
  blockId: number;
  /** True when x/y/width/height are real pretext coords (not fallback zeros). */
  hasCoords: boolean;
}

export type RevealComponent = ComponentType<RevealComponentProps>;

export interface RevealProp {
  /** Token pacing. `false` disables; omitted defaults to `{ delayInMs: 30, chunking: "word" }`. */
  throttle?: ThrottleOptions | false;
  /** Per-token visual reveal. `false` disables; omitted defaults to built-in fadeIn. */
  animate?: AnimateOptions | false;
  /**
   * Replaces the default `<span data-inkset-reveal-token>` for each token.
   * Consumer receives {@link RevealComponentProps} and is fully in charge of
   * the rendered markup and animation. The default CSS reveal doesn't apply
   * when this is set.
   */
  component?: RevealComponent;
  /**
   * Optional canvas-overlay shader garnish. The preset is dynamically loaded
   * on demand and receives fresh token rects per tick; visible text stays in
   * the DOM for selection, a11y, and find-in-page.
   */
  shader?: ShaderConfig | false;
}

/** Token emitted by TokenGate into the pipeline. */
export type TokenEmitter = (chunk: string) => void | Promise<void>;
