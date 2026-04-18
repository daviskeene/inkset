// React bindings for inkset: the <Inkset> component, useInkset hook, and block renderer.
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  memo,
  type ReactNode,
} from "react";
import {
  DEFAULT_BLOCK_SPACING,
  StreamingPipeline,
  PluginRegistry,
  extractText,
  resolveBlockGap,
  type PipelineState,
  type InksetOptions,
  type HyphenationOption,
  type LayoutBlock,
  type EnrichedNode,
  type InksetPlugin,
  type TextWrapOption,
  type HeadingSizeTuple,
  type HeadingWeightTuple,
  type HeadingLineHeightTuple,
  type ShrinkwrapOption,
  type GlyphPositionLookup,
  type BlockSpacing,
} from "@inkset/core";
import {
  createTokenGate,
  defaultShaderRegistry,
  resolveShaderSource,
  wrapBlockDelta,
  type TokenGate,
  type RevealProp,
  type ThrottleOptions,
  type TimelineOptions,
  type CssRevealOptions,
  type RevealComponent,
  type RevealComponentProps,
  type ShaderConfig,
  type ShaderRegistry,
  type ShaderSource,
  type ShaderInstance,
  type ShaderToken,
} from "@inkset/animate";
import { createCopyHandler } from "./copy";
import { themeToCssVars, type InksetTheme } from "./theme";

const DEFAULT_FONT_SIZE = 16;
const DEFAULT_LINE_HEIGHT = 24;
const DEFAULT_LINE_HEIGHT_RATIO = 1.5;

// Emits the `--inkset-heading-N-*` CSS vars from the numeric tuple props so
// visuals track measurement. Sizes become `em` (relative to base font-size),
// line-heights stay unitless, weights pass through.
const headingTuplesToCssVars = (
  sizes: HeadingSizeTuple | undefined,
  weights: HeadingWeightTuple | undefined,
  lineHeights: HeadingLineHeightTuple | undefined,
): Record<`--${string}`, string | number> => {
  const vars: Record<`--${string}`, string | number> = {};
  if (sizes) {
    for (let i = 0; i < 4; i++) {
      vars[`--inkset-heading-${i + 1}-size`] = `${sizes[i]}em`;
    }
  }
  if (weights) {
    for (let i = 0; i < 4; i++) {
      vars[`--inkset-heading-${i + 1}-weight`] = weights[i];
    }
  }
  if (lineHeights) {
    for (let i = 0; i < 4; i++) {
      vars[`--inkset-heading-${i + 1}-line-height`] = lineHeights[i];
    }
  }
  return vars;
};

// Inkset ships a single stylesheet with two layers:
//
//   1. A defaults block (`:where(.inkset-root)`) that declares every knob as a
//      CSS custom property with its current baked-in value. Zero specificity
//      via :where() — any consumer class, style, or descendant var override
//      wins without !important.
//
//   2. The rules themselves, also wrapped in :where() so consumers can
//      override any selector at normal (higher) specificity.
//
// All colors/sizes/spacing below reference --inkset-* vars. Consumers theme
// Inkset by setting these vars (on .inkset-root, via style={}, or via a
// global stylesheet), not by selector-warring with !important.
const INKSET_STYLES = `
  :where(.inkset-root) {
    /* Colors */
    --inkset-color-text: #e8e8eb;
    --inkset-color-text-muted: rgba(232, 232, 235, 0.78);
    --inkset-color-hr: rgba(255, 255, 255, 0.1);
    --inkset-blockquote-accent: rgba(255, 255, 255, 0.18);
    --inkset-blockquote-text: rgba(232, 232, 235, 0.78);
    --inkset-inline-code-bg: rgba(255, 255, 255, 0.08);
    --inkset-inline-code-text: inherit;
    --inkset-code-block-bg: #24292e;
    --inkset-code-scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    --inkset-code-selection-bg: rgba(100, 140, 220, 0.35);
    --inkset-code-header-border: rgba(255, 255, 255, 0.06);
    --inkset-table-border: rgba(255, 255, 255, 0.08);
    --inkset-table-header-text: rgba(232, 232, 235, 0.72);
    --inkset-table-header-bg: transparent;
    --inkset-table-zebra-bg: rgba(255, 255, 255, 0.03);
    --inkset-table-row-hover-bg: rgba(255, 255, 255, 0.04);
    --inkset-math-error: #f87171;
    --inkset-math-display-bg: transparent;
    --inkset-math-inline-bg: transparent;
    --inkset-math-selection-bg: rgba(100, 140, 220, 0.35);

    /* Typography */
    --inkset-font-family: system-ui, sans-serif;
    --inkset-font-family-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    --inkset-base-font-size: 16px;
    --inkset-base-line-height-ratio: 1.5;
    --inkset-heading-1-size: 3em;
    --inkset-heading-1-line-height: 1.05;
    --inkset-heading-1-weight: 800;
    --inkset-heading-1-tracking: -0.04em;
    --inkset-heading-2-size: 2.15em;
    --inkset-heading-2-line-height: 1.08;
    --inkset-heading-2-weight: 780;
    --inkset-heading-2-tracking: -0.035em;
    --inkset-heading-3-size: 1.3em;
    --inkset-heading-3-line-height: 1.15;
    --inkset-heading-3-weight: 720;
    --inkset-heading-3-tracking: -0.02em;
    --inkset-heading-4-size: 1em;
    --inkset-heading-4-line-height: 1.2;
    --inkset-heading-4-weight: 680;
    --inkset-inline-code-size: 0.92em;

    /* Spacing */
    --inkset-list-indent: 1.4em;
    --inkset-blockquote-padding-left: 1em;
    --inkset-blockquote-border-width: 3px;
    --inkset-inline-code-padding: 0.15em 0.35em;
    --inkset-inline-code-radius: 0.35em;
    --inkset-code-block-padding: 12px 16px;
    --inkset-code-block-radius: 14px;
    --inkset-code-block-font-size: 14px;
    --inkset-code-block-line-height: 1.5;
    --inkset-code-header-padding: 4px 12px;
    --inkset-code-header-font-size: 12px;
    --inkset-code-header-opacity: 0.7;
    --inkset-code-copy-padding: 2px 6px;
    --inkset-code-copy-opacity: 0.8;
    --inkset-table-cell-padding: 10px 12px;
    --inkset-table-header-font-size: 12px;
    --inkset-table-header-weight: 700;
    --inkset-table-header-tracking: 0;
    --inkset-table-header-padding: 2px 8px;
    --inkset-math-display-padding: 8px 0;
    --inkset-math-display-line-height: 1.2;
    --inkset-math-display-radius: 0;
    --inkset-math-raw-font-size: 14px;
    --inkset-math-raw-opacity: 0.6;
    --inkset-math-error-font-size: 13px;
    --inkset-diagram-bg: transparent;
    --inkset-diagram-padding: 16px 14px;
    --inkset-diagram-radius: 14px;
    --inkset-diagram-border: rgba(255, 255, 255, 0.06);
    --inkset-diagram-header-padding: 4px 12px;
    --inkset-diagram-header-font-size: 12px;
    --inkset-diagram-header-opacity: 0.6;
    --inkset-diagram-source-bg: rgba(255, 255, 255, 0.03);
    --inkset-diagram-source-font-size: 13px;
    --inkset-diagram-error-color: #f87171;
  }

  :where(.inkset-root) {
    color: var(--inkset-color-text);
    font-family: var(--inkset-font-family);
    font-size: var(--inkset-base-font-size);
    line-height: var(--inkset-base-line-height-ratio);
  }

  :where(.inkset-root) > [data-block-id] {
    left: 0;
    top: 0;
  }

  /* Shrinkwrap: a per-block CSS var set inline by BlockRenderer. Routes to
     max-width on the text-level child so the block's allocated width stays
     intact (for positioning math) while the text column narrows. */
  :where(.inkset-root) > [data-block-id][style*="--inkset-shrinkwrap-width"] > :where(p, h1, h2, h3, h4, h5, h6, blockquote, ul, ol) {
    max-width: var(--inkset-shrinkwrap-width);
  }

  :where(.inkset-root h1, .inkset-root h2, .inkset-root h3, .inkset-root h4, .inkset-root h5, .inkset-root h6, .inkset-root p, .inkset-root pre, .inkset-root blockquote, .inkset-root ul, .inkset-root ol, .inkset-root table) {
    margin: 0;
  }

  :where(.inkset-root h1) {
    font-size: var(--inkset-heading-1-size);
    line-height: var(--inkset-heading-1-line-height);
    letter-spacing: var(--inkset-heading-1-tracking);
    font-weight: var(--inkset-heading-1-weight);
  }

  :where(.inkset-root h2) {
    font-size: var(--inkset-heading-2-size);
    line-height: var(--inkset-heading-2-line-height);
    letter-spacing: var(--inkset-heading-2-tracking);
    font-weight: var(--inkset-heading-2-weight);
  }

  :where(.inkset-root h3) {
    font-size: var(--inkset-heading-3-size);
    line-height: var(--inkset-heading-3-line-height);
    letter-spacing: var(--inkset-heading-3-tracking);
    font-weight: var(--inkset-heading-3-weight);
  }

  :where(.inkset-root h4, .inkset-root h5, .inkset-root h6) {
    font-size: var(--inkset-heading-4-size);
    line-height: var(--inkset-heading-4-line-height);
    font-weight: var(--inkset-heading-4-weight);
  }

  :where(.inkset-root p, .inkset-root li, .inkset-root blockquote) {
    font-size: 1em;
    line-height: var(--inkset-base-line-height-ratio);
  }

  :where(.inkset-root ul, .inkset-root ol) {
    padding-left: var(--inkset-list-indent);
  }

  :where(.inkset-root blockquote) {
    padding-left: var(--inkset-blockquote-padding-left);
    border-left: var(--inkset-blockquote-border-width) solid var(--inkset-blockquote-accent);
    color: var(--inkset-blockquote-text);
  }

  :where(.inkset-root hr) {
    margin: 0;
    border: 0;
    border-top: 1px solid var(--inkset-color-hr);
  }

  :where(.inkset-root code:not(pre code)) {
    padding: var(--inkset-inline-code-padding);
    border-radius: var(--inkset-inline-code-radius);
    background: var(--inkset-inline-code-bg);
    color: var(--inkset-inline-code-text);
    font-family: var(--inkset-font-family-mono);
    font-size: var(--inkset-inline-code-size);
  }

  :where(.inkset-root .inkset-default-block) {
    width: 100%;
  }

  :where(.inkset-root .inkset-code-block, .inkset-root .inkset-table-block, .inkset-root .inkset-math) {
    width: 100%;
  }

  :where(.inkset-root .inkset-code-header) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--inkset-code-header-padding);
    font-size: var(--inkset-code-header-font-size);
    line-height: 16px;
    font-family: var(--inkset-font-family);
    opacity: var(--inkset-code-header-opacity);
    border-bottom: 1px solid var(--inkset-code-header-border);
  }

  :where(.inkset-root .inkset-code-copy, .inkset-root .inkset-table-copy) {
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--inkset-code-copy-padding);
    font-size: var(--inkset-code-header-font-size);
    line-height: 16px;
    font-family: inherit;
    color: inherit;
    opacity: var(--inkset-code-copy-opacity);
  }

  :where(.inkset-root .inkset-code-content pre, .inkset-root .inkset-code-content .shiki) {
    margin: 0;
    padding: var(--inkset-code-block-padding);
    overflow-x: auto;
    border-radius: var(--inkset-code-block-radius);
    background: var(--inkset-code-block-bg);
    font-family: var(--inkset-font-family-mono);
    font-size: var(--inkset-code-block-font-size);
    line-height: var(--inkset-code-block-line-height);
    scrollbar-color: var(--inkset-code-scrollbar-color);
  }

  :where(.inkset-root .inkset-code-block[data-wrap="true"] .inkset-code-content pre,
         .inkset-root .inkset-code-block[data-wrap="true"] .inkset-code-content .shiki) {
    white-space: pre-wrap;
    word-break: break-word;
    overflow-x: visible;
  }

  :where(.inkset-root .inkset-code-content pre)::selection,
  :where(.inkset-root .inkset-code-content code)::selection,
  :where(.inkset-root .inkset-code-content .shiki span)::selection {
    background: var(--inkset-code-selection-bg);
  }

  :where(.inkset-root .inkset-code-content code) {
    background: transparent;
    padding: 0;
    border-radius: 0;
  }

  /* Dual light/dark render: when data-has-light is set, show dark by default
     and swap to the light render under prefers-color-scheme: light. Without
     the flag there's only one render and it always shows. */
  :where(.inkset-root .inkset-code-block[data-has-light="true"] .inkset-code-light) {
    display: none;
  }

  @media (prefers-color-scheme: light) {
    :where(.inkset-root .inkset-code-block[data-has-light="true"] .inkset-code-dark) {
      display: none;
    }
    :where(.inkset-root .inkset-code-block[data-has-light="true"] .inkset-code-light) {
      display: block;
    }
  }

  :where(.inkset-root .inkset-code-streaming) {
    position: absolute;
    bottom: 4px;
    right: 8px;
    font-size: 10px;
    opacity: 0.5;
  }

  :where(.inkset-root .inkset-table-header) {
    display: flex;
    justify-content: flex-end;
    padding: var(--inkset-table-header-padding);
    font-size: 11px;
    line-height: 14px;
    font-family: var(--inkset-font-family);
    opacity: 0.6;
  }

  :where(.inkset-root .inkset-table-scroll) {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  :where(.inkset-root .inkset-table-scroll table) {
    width: max-content;
    min-width: 100%;
    border-collapse: collapse;
  }

  :where(.inkset-root .inkset-table-scroll th, .inkset-root .inkset-table-scroll td) {
    padding: var(--inkset-table-cell-padding);
    border-bottom: 1px solid var(--inkset-table-border);
    text-align: left;
    white-space: nowrap;
  }

  :where(.inkset-root .inkset-table-block[data-border-style="all"] .inkset-table-scroll th,
         .inkset-root .inkset-table-block[data-border-style="all"] .inkset-table-scroll td) {
    border: 1px solid var(--inkset-table-border);
  }

  :where(.inkset-root .inkset-table-block[data-border-style="none"] .inkset-table-scroll th,
         .inkset-root .inkset-table-block[data-border-style="none"] .inkset-table-scroll td) {
    border: 0;
  }

  :where(.inkset-root .inkset-table-block[data-zebra="true"] .inkset-table-scroll tbody tr:nth-child(even) td) {
    background: var(--inkset-table-zebra-bg);
  }

  :where(.inkset-root .inkset-table-block .inkset-table-scroll tbody tr:hover td) {
    background: var(--inkset-table-row-hover-bg);
  }

  :where(.inkset-root .inkset-table-block[data-sticky-header="true"] .inkset-table-scroll thead th) {
    position: sticky;
    top: 0;
    background: var(--inkset-table-header-bg);
  }

  :where(.inkset-root .inkset-table-scroll th) {
    color: var(--inkset-table-header-text);
    font-size: var(--inkset-table-header-font-size);
    font-weight: var(--inkset-table-header-weight);
    letter-spacing: var(--inkset-table-header-tracking);
  }

  :where(.inkset-root .inkset-math-display) {
    text-align: center;
    padding: var(--inkset-math-display-padding);
    overflow: auto;
    line-height: var(--inkset-math-display-line-height);
    background: var(--inkset-math-display-bg);
    border-radius: var(--inkset-math-display-radius);
  }

  :where(.inkset-root .inkset-math-display[data-display-align="left"]) {
    text-align: left;
  }

  :where(.inkset-root .inkset-math-display[data-display-align="right"]) {
    text-align: right;
  }

  :where(.inkset-root .inkset-math-inline) {
    display: inline;
    background: var(--inkset-math-inline-bg);
  }

  :where(.inkset-root .inkset-math-display)::selection,
  :where(.inkset-root .inkset-math-inline)::selection {
    background: var(--inkset-math-selection-bg);
  }

  :where(.inkset-root .inkset-math-error) {
    color: var(--inkset-math-error);
    font-family: var(--inkset-font-family-mono);
    font-size: var(--inkset-math-error-font-size);
    line-height: 1.4;
  }

  :where(.inkset-root .inkset-math-raw) {
    font-family: var(--inkset-font-family-mono);
    font-size: var(--inkset-math-raw-font-size);
    line-height: 1.4;
    opacity: var(--inkset-math-raw-opacity);
  }

  :where(.inkset-root .inkset-diagram-block) {
    background: var(--inkset-diagram-bg);
    border: 1px solid var(--inkset-diagram-border);
    border-radius: var(--inkset-diagram-radius);
    overflow: hidden;
  }

  :where(.inkset-root .inkset-diagram-header) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--inkset-diagram-header-padding);
    font-size: var(--inkset-diagram-header-font-size);
    line-height: 16px;
    font-family: var(--inkset-font-family);
    opacity: var(--inkset-diagram-header-opacity);
    border-bottom: 1px solid var(--inkset-diagram-border);
  }

  :where(.inkset-root .inkset-diagram-copy) {
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 6px;
    font-size: var(--inkset-diagram-header-font-size);
    line-height: 16px;
    font-family: inherit;
    color: inherit;
    opacity: 0.9;
  }

  :where(.inkset-root .inkset-diagram-content) {
    padding: var(--inkset-diagram-padding);
    display: flex;
    justify-content: center;
    overflow-x: auto;
  }

  :where(.inkset-root .inkset-diagram-content svg) {
    max-width: 100%;
    height: auto;
  }

  :where(.inkset-root .inkset-diagram-source) {
    margin: 0;
    padding: var(--inkset-diagram-padding);
    background: var(--inkset-diagram-source-bg);
    font-family: var(--inkset-font-family-mono);
    font-size: var(--inkset-diagram-source-font-size);
    line-height: 1.5;
    white-space: pre;
    overflow-x: auto;
  }

  :where(.inkset-root .inkset-diagram-error) {
    padding: var(--inkset-diagram-padding);
  }

  :where(.inkset-root .inkset-diagram-error-label) {
    color: var(--inkset-diagram-error-color);
    font-family: var(--inkset-font-family-mono);
    font-size: 12px;
    margin-bottom: 6px;
  }

  :where(.inkset-root .inkset-diagram-error .inkset-diagram-source) {
    padding: 8px 10px;
    border-radius: 8px;
  }

  .inkset-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 0;
    font-size: 13px;
    opacity: 0.55;
  }
  .inkset-loading-spinner {
    width: 12px;
    height: 12px;
    border: 1.5px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: inkset-spin 0.8s linear infinite;
  }
  @keyframes inkset-spin {
    to { transform: rotate(360deg); }
  }

  /* ── Reveal animations (active only when data-inkset-reveal is set on root) */

  :where(.inkset-root[data-inkset-reveal]) [data-inkset-reveal-token] {
    display: var(--inkset-reveal-display, inline-block);
    animation-name: var(--inkset-reveal-name, inkset-reveal-fade);
    animation-duration: var(--inkset-reveal-duration, 320ms);
    animation-timing-function: var(--inkset-reveal-easing, cubic-bezier(.2,.8,.2,1));
    animation-fill-mode: both;
    animation-delay: var(--inkset-reveal-delay, 0ms);
  }

  @keyframes inkset-reveal-fade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes inkset-reveal-blur-in {
    from {
      opacity: 0;
      filter: blur(10px);
      transform: translateY(0.08em);
    }
    to {
      opacity: 1;
      filter: none;
      transform: none;
    }
  }
  @keyframes inkset-reveal-slide-up {
    from { opacity: 0; transform: translateY(0.3em); }
    to   { opacity: 1; transform: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    :where(.inkset-root[data-inkset-reveal]) [data-inkset-reveal-token] {
      animation-duration: 1ms !important;
      animation-delay: 0ms !important;
    }
  }

  /* Visually-hidden mirror used for aria-live announcements. Wrapping text in
     per-token spans fragments screen-reader output; the mirror carries the
     full block text at render-complete so AT announces once, coherently. */
  .inkset-aria-mirror {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
`;

const InksetDefaultLoading = () => {
  return (
    <div className="inkset-loading" role="status">
      <span className="inkset-loading-spinner" aria-hidden />
      <span>Loading…</span>
    </div>
  );
};

type ResolvedBlockHeight = {
  height: number;
  node: EnrichedNode;
  width: number;
};

type ObservedHeightCache = Map<number, Map<number, number>>;

const resolveLayout = (
  layout: readonly LayoutBlock[],
  heightMap: ReadonlyMap<number, ResolvedBlockHeight>,
  observedHeightCache: Readonly<ObservedHeightCache>,
  blockSpacing: BlockSpacing | undefined,
): LayoutBlock[] => {
  if (layout.length === 0) return [];

  let currentY = layout[0]?.y ?? 0;

  return layout.map((block, index) => {
    const resolved = heightMap.get(block.blockId);
    let height = block.height;

    // Only trust DOM-resolved heights when captured for the same block instance
    // at the same width, preventing stale-height lag during interactive resize
    if (
      resolved &&
      resolved.node === block.node &&
      resolved.height > 0 &&
      resolved.width === block.width
    ) {
      height = resolved.height;
    } else {
      const cachedHeight = observedHeightCache.get(block.blockId)?.get(block.width);
      if (cachedHeight && cachedHeight > 0) {
        height = cachedHeight;
      }
    }

    const nextBlock: LayoutBlock = {
      ...block,
      y: currentY,
      height,
    };

    if (index < layout.length - 1) {
      currentY += height + resolveBlockGap(block.kind, layout[index + 1].kind, blockSpacing);
    }
    return nextBlock;
  });
};

const getLayoutHeight = (layout: readonly LayoutBlock[]): number => {
  if (layout.length === 0) return 0;
  const lastBlock = layout[layout.length - 1];
  return lastBlock.y + lastBlock.height;
};

// ── useInkset hook ───────────────────────────────────────────────

export interface UseInksetOptions extends InksetOptions {
  streaming?: boolean;
  width?: number;
}

// Shapes the `reveal` prop object into the two concrete sub-configs we actually
// act on during render. `false` / missing keys collapse to `null` so later
// checks are a single truthiness test.
type ResolvedTimeline = Required<Omit<TimelineOptions, "order" | "maxSpanMs">> & {
  order: NonNullable<TimelineOptions["order"]>;
  maxSpanMs: number;
};

type ResolvedCss = Required<CssRevealOptions> & {
  preset: string;
};

type ResolvedShader = {
  source: ShaderSource;
  options?: Record<string, unknown>;
};

const isShaderConfigObject = (
  shader: ShaderConfig | false | undefined,
): shader is Extract<ShaderConfig, { source: ShaderSource }> =>
  typeof shader === "object" && shader !== null && "source" in shader;

const shaderSourceSignature = (source: ShaderSource): string => {
  if (typeof source === "string") return `name:${source}`;
  if (typeof source === "function") return `loader:${source.name || "anonymous"}`;
  return `preset:${source.name}`;
};

const shaderConfigSignature = (shader: ShaderConfig | false | undefined): string => {
  if (!shader) return "off";
  if (!isShaderConfigObject(shader)) return shaderSourceSignature(shader);
  try {
    return `${shaderSourceSignature(shader.source)}:${JSON.stringify(shader.options ?? {})}`;
  } catch {
    return shaderSourceSignature(shader.source);
  }
};

const resolveRevealConfig = (
  reveal: RevealProp | undefined,
): {
  throttle: Required<ThrottleOptions> | null;
  timeline: ResolvedTimeline | null;
  css: ResolvedCss | null;
  component: RevealComponent | null;
  shader: ResolvedShader | null;
} => {
  const throttleRaw = reveal?.throttle;
  const timelineRaw = reveal?.timeline;
  const cssRaw = reveal?.css;
  const shaderRaw = reveal?.shader;

  const throttle =
    throttleRaw === false || reveal === undefined
      ? null
      : {
          delayInMs: throttleRaw?.delayInMs ?? 30,
          chunking: throttleRaw?.chunking ?? "word",
        };

  const timeline: ResolvedTimeline | null =
    timelineRaw === false || reveal === undefined
      ? null
      : {
          durationMs: timelineRaw?.durationMs ?? 320,
          stagger: timelineRaw?.stagger ?? 30,
          sep: timelineRaw?.sep ?? "word",
          order: timelineRaw?.order ?? "layout",
          maxSpanMs: timelineRaw?.maxSpanMs ?? 400,
        };

  const css: ResolvedCss | null =
    cssRaw === false || reveal === undefined
      ? null
      : {
          preset: cssRaw?.preset ?? "fadeIn",
          easing: cssRaw?.easing ?? "cubic-bezier(.2,.8,.2,1)",
        };

  const component = reveal?.component ?? null;
  const shader =
    shaderRaw === false || shaderRaw == null
      ? null
      : isShaderConfigObject(shaderRaw)
        ? { source: shaderRaw.source, options: shaderRaw.options }
        : { source: shaderRaw };

  return { throttle, timeline, css, component, shader };
};

// Map preset name → CSS `@keyframes` identifier. Unknown strings pass through,
// matching streamdown's convention that lets consumers register custom
// keyframes in their own stylesheets and reference them by name.
const presetToKeyframeName = (preset: string): string => {
  switch (preset) {
    case "fadeIn":
      return "inkset-reveal-fade";
    case "blurIn":
      return "inkset-reveal-blur-in";
    case "slideUp":
      return "inkset-reveal-slide-up";
    default:
      return preset;
  }
};

const hyphenationSignature = (option: HyphenationOption | undefined): string => {
  if (!option) return "off";
  if (option === true) return "en-us";
  return option.lang;
};

export type UseInksetResult = {
  state: PipelineState | null;
  registry: PluginRegistry;
  /** Incremented every time the underlying pipeline is rebuilt. */
  pipelineVersion: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  appendToken: (token: string) => Promise<void>;
  endStream: () => Promise<void>;
  setContent: (content: string) => Promise<void>;
  /**
   * Sync accessor for a glyph-position lookup used by the reveal layer. Only
   * returns non-null once the pipeline has initialized and pretext has
   * loaded. Safe to call from render; cheap for the same (blockId, width).
   */
  getGlyphLookup: (node: EnrichedNode, maxWidth: number) => GlyphPositionLookup | null;
};

export const useInkset = (options?: UseInksetOptions): UseInksetResult => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pipelineRef = useRef<StreamingPipeline | null>(null);
  const registryRef = useRef<PluginRegistry>(new PluginRegistry());
  const [state, setState] = useState<PipelineState | null>(null);
  // Bumped on every pipeline rebuild so consumers can re-submit content.
  // (registryRef alone can't do this — ref writes don't trigger re-render.)
  const [pipelineVersion, setPipelineVersion] = useState(0);
  const pluginSignature =
    options?.plugins?.map((plugin) => `${plugin.name}:${plugin.key ?? ""}`).join("|") ?? "";
  const hyphenationKey = hyphenationSignature(options?.hyphenation);
  const shrinkwrapKey = String(options?.shrinkwrap ?? false);
  const blockSpacingKey = JSON.stringify(options?.blockSpacing ?? null);
  const headingSizesKey = options?.headingSizes?.join(",") ?? "";
  const headingWeightsKey = options?.headingWeights?.join(",") ?? "";
  const headingLineHeightsKey = options?.headingLineHeights?.join(",") ?? "";

  useEffect(() => {
    const pipeline = new StreamingPipeline(options);
    pipelineRef.current = pipeline;
    registryRef.current = pipeline.getRegistry();

    // Seed width before setContent can schedule a measurement pass. The
    // dedicated width effects below can't do this on first mount: the
    // useLayoutEffect runs before this useEffect (so pipelineRef is still
    // null), and the useEffect early-returns when options.width is provided.
    // Without this seed, the first runPipeline measures at containerWidth=0
    // and the fallback produces one-char-per-line heights, leaving huge gaps
    // between blocks that only resolve on a later setWidth.
    const seededWidth =
      typeof options?.width === "number" && options.width > 0
        ? options.width
        : containerRef.current?.getBoundingClientRect().width ?? 0;
    if (seededWidth > 0) {
      pipeline.setWidth(seededWidth);
    }

    setState(null);
    setPipelineVersion((v) => v + 1);

    const unsubscribe = pipeline.subscribe(setState);
    pipeline.init();

    return () => {
      unsubscribe();
      pipeline.destroy();
      pipelineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pluginSignature,
    options?.font,
    options?.fontSize,
    options?.lineHeight,
    blockSpacingKey,
    options?.cacheSize,
    hyphenationKey,
    shrinkwrapKey,
    headingSizesKey,
    headingWeightsKey,
    headingLineHeightsKey,
  ]);

  useEffect(() => {
    if (typeof options?.width === "number" && options.width > 0) {
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    // Seed the new pipeline with the current container width so the first
    // runPipeline doesn't measure at zero.
    const currentWidth = container.getBoundingClientRect().width;
    if (currentWidth > 0) {
      pipelineRef.current?.setWidth(currentWidth);
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0) {
          pipelineRef.current?.setWidth(width);
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [options?.width, pipelineVersion]);

  useLayoutEffect(() => {
    if (typeof options?.width !== "number" || options.width <= 0) {
      return;
    }

    pipelineRef.current?.setWidth(options.width);
  }, [options?.width, pipelineVersion]);

  const appendToken = useCallback(async (token: string) => {
    await pipelineRef.current?.appendToken(token);
  }, []);

  const endStream = useCallback(async () => {
    await pipelineRef.current?.endStream();
  }, []);

  const setContent = useCallback(async (content: string) => {
    await pipelineRef.current?.setContent(content);
  }, []);

  const getGlyphLookup = useCallback(
    (node: EnrichedNode, maxWidth: number): GlyphPositionLookup | null => {
      return pipelineRef.current?.buildGlyphLookupForBlock(node, maxWidth) ?? null;
    },
    [],
  );

  return {
    state,
    registry: registryRef.current,
    pipelineVersion,
    containerRef,
    appendToken,
    endStream,
    setContent,
    getGlyphLookup,
  };
};

// ── Block renderer ─────────────────────────────────────────────────

type BlockRendererProps = {
  block: LayoutBlock;
  registry: PluginRegistry;
  isStreaming: boolean;
  /** "absolute" for frozen blocks, "flow" for the hot streaming block */
  positioning: "absolute" | "flow";
  observeHeight: boolean;
  onHeightChange: (
    blockId: number,
    node: EnrichedNode,
    width: number,
    height: number,
    priority?: "sync" | "deferred",
  ) => void;
  /**
   * Optional override for the node rendered by the default renderer. Used by
   * the reveal layer to swap in a delta-wrapped version of the same block's
   * tree. Plugin-backed blocks ignore this — plugins own their render.
   * Layout math (x/y/width/height) still uses `block.node`.
   */
  displayNode?: EnrichedNode;
  /** Consumer-supplied component that replaces each reveal span. */
  revealComponent?: RevealComponent | null;
  /** Animation duration (ms) — forwarded to `RevealComponentProps.durationMs`. */
  revealDurationMs?: number;
};

const BlockRenderer = memo(
  function BlockRenderer({
    block,
    registry,
    isStreaming,
    positioning,
    observeHeight,
    onHeightChange,
    displayNode,
    revealComponent,
    revealDurationMs,
  }: BlockRendererProps) {
    const { node, x, y, width, height, shrinkwrapWidth } = block;
    const blockRef = useRef<HTMLDivElement>(null);

    const plugin = node.transformedBy ? registry.get(node.transformedBy) : undefined;

    const PluginComponent = plugin?.component;

    const reportHeight = useCallback(
      (priority: "sync" | "deferred") => {
        const element = blockRef.current;
        if (!element) return;
        const nextHeight = Math.ceil(element.getBoundingClientRect().height);
        if (nextHeight > 0) {
          onHeightChange(block.blockId, node, width, nextHeight, priority);
        }
      },
      [block.blockId, node, onHeightChange, width],
    );

    const handleContentSettled = useCallback(() => {
      reportHeight("sync");
    }, [reportHeight]);

    // Shrinkwrap narrows the text content without changing the block's allocated
    // width, so positioning math and plugin-rendered blocks stay unaffected.
    const contentMaxWidth =
      shrinkwrapWidth && shrinkwrapWidth < width ? shrinkwrapWidth : undefined;

    const style: React.CSSProperties =
      positioning === "absolute"
        ? {
            position: "absolute",
            transform: `translate(${x}px, ${y}px)`,
            width,
            minHeight: height,
            willChange: "transform",
            contain: "layout style",
          }
        : {
            width,
          };
    if (contentMaxWidth) {
      // Apply via a CSS var so the default stylesheet can route it to `max-width`
      // on child text elements (p, h1..h6, blockquote) without clamping
      // plugin-rendered blocks that fill their own container.
      (style as Record<string, string | number>)["--inkset-shrinkwrap-width"] =
        `${contentMaxWidth}px`;
    }

    // Capture real DOM height so frozen absolute layout inherits it seamlessly
    useLayoutEffect(() => {
      if (!observeHeight) return;

      const element = blockRef.current;
      if (!element) return;
      const observerPriority = positioning === "flow" ? "sync" : "deferred";

      reportHeight(observerPriority);

      const observer = new ResizeObserver(() => {
        reportHeight(observerPriority);
      });

      observer.observe(element);
      return () => observer.disconnect();
    }, [height, observeHeight, positioning, reportHeight]);

    return (
      <div
        ref={blockRef}
        style={style}
        data-block-id={block.blockId}
        data-block-type={node.blockType}
        role="article"
      >
        {PluginComponent ? (
          <PluginComponent
            node={node}
            isStreaming={isStreaming}
            onContentSettled={handleContentSettled}
          />
        ) : (
          <DefaultBlockRenderer
            node={displayNode ?? node}
            registry={registry}
            revealComponent={revealComponent ?? null}
            revealDurationMs={revealDurationMs ?? 0}
          />
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.block.blockId === next.block.blockId &&
    prev.block.x === next.block.x &&
    prev.block.y === next.block.y &&
    prev.block.width === next.block.width &&
    prev.block.height === next.block.height &&
    prev.block.node === next.block.node &&
    prev.isStreaming === next.isStreaming &&
    prev.positioning === next.positioning &&
    prev.observeHeight === next.observeHeight &&
    prev.onHeightChange === next.onHeightChange &&
    prev.displayNode === next.displayNode &&
    prev.revealComponent === next.revealComponent &&
    prev.revealDurationMs === next.revealDurationMs,
);

// ── Default block renderer ────────────────────────────────────────

type MathInlinePlugin = InksetPlugin & {
  rendererName?: string;
};

const DefaultBlockRenderer = ({
  node,
  registry,
  revealComponent,
  revealDurationMs,
}: {
  node: EnrichedNode;
  registry: PluginRegistry;
  revealComponent?: RevealComponent | null;
  revealDurationMs?: number;
}) => {
  return (
    <div className="inkset-default-block">
      {renderAstNode(
        node,
        registry,
        `${node.blockId}`,
        true,
        revealComponent ?? null,
        revealDurationMs ?? 0,
      )}
    </div>
  );
};

// Tags where whitespace-only text nodes are invalid HTML children. React's
// hydration checker flags these (`whitespace text nodes cannot be a child of
// <table>`). The remark pipeline preserves source newlines as text nodes, so
// we strip them when rendering the default table structure.
const TABLE_CONTEXT_TAGS = new Set(["table", "thead", "tbody", "tfoot", "tr"]);

const renderAstNode = (
  node: EnrichedNode,
  registry: PluginRegistry,
  key: string,
  allowInlineMath: boolean = true,
  revealComponent: RevealComponent | null = null,
  revealDurationMs: number = 0,
): React.ReactNode => {
  if (node.type === "text") {
    return renderTextNode(node, registry, key, allowInlineMath);
  }

  if (node.type === "root") {
    return node.children?.map((child, index) =>
      renderAstNode(
        child as EnrichedNode,
        registry,
        `${key}.${index}`,
        allowInlineMath,
        revealComponent,
        revealDurationMs,
      ),
    );
  }

  const tagName = node.tagName ?? "div";
  const nextAllowInlineMath = allowInlineMath && tagName !== "code" && tagName !== "pre";
  const props = toReactProps(node.properties, key);

  // Phase 4 — intercept reveal spans if a consumer component is configured.
  // The wrap layer stashes coord + timing data on data-* attrs; parse back to
  // numeric props here. Inner text is rendered normally via `children`; the
  // consumer can render `{children}` to keep the token visible, or ignore it
  // (e.g. if they're drawing the text themselves on a canvas).
  if (revealComponent && tagName === "span" && props["data-inkset-reveal-token"] === "") {
    const rawChildren = node.children;
    const children = rawChildren?.map((child, index) =>
      renderAstNode(
        child as EnrichedNode,
        registry,
        `${key}.${index}`,
        false,
        null,
        revealDurationMs,
      ),
    );

    const style = props.style as Record<string, string | number> | undefined;
    const delayRaw = style?.["--inkset-reveal-delay"] as string | undefined;
    const delayMs = delayRaw ? parseFloat(delayRaw) : 0;
    const token = extractTextFromChildren(rawChildren);
    const x = parseFloat((props["data-inkset-reveal-x"] as string) ?? "") || 0;
    const y = parseFloat((props["data-inkset-reveal-y"] as string) ?? "") || 0;
    const width = parseFloat((props["data-inkset-reveal-w"] as string) ?? "") || 0;
    const height = parseFloat((props["data-inkset-reveal-h"] as string) ?? "") || 0;
    const hasCoords = "data-inkset-reveal-x" in props;
    const tickId = parseInt((props["data-inkset-reveal-tick"] as string) ?? "0", 10);
    const tokenIndex = parseInt((props["data-inkset-reveal-index"] as string) ?? "0", 10);

    const RevealImpl = revealComponent;
    const componentProps: RevealComponentProps = {
      token,
      children,
      x,
      y,
      width,
      height,
      delayMs,
      durationMs: revealDurationMs,
      tickId,
      tokenIndex,
      blockId: node.blockId,
      hasCoords,
    };
    const revealKey = `${key}.reveal.${tickId}.${tokenIndex}`;
    return React.createElement(RevealImpl, { key: revealKey, ...componentProps });
  }

  const rawChildren = TABLE_CONTEXT_TAGS.has(tagName)
    ? node.children?.filter((child) => !isWhitespaceTextNode(child as EnrichedNode))
    : node.children;
  const children = rawChildren?.map((child, index) =>
    renderAstNode(
      child as EnrichedNode,
      registry,
      `${key}.${index}`,
      nextAllowInlineMath,
      revealComponent,
      revealDurationMs,
    ),
  );

  return React.createElement(tagName, props, ...(children ?? []));
};

const extractTextFromChildren = (children: EnrichedNode["children"] | undefined): string => {
  if (!children) return "";
  let out = "";
  for (const child of children) {
    const c = child as EnrichedNode;
    if (c.type === "text") out += c.value ?? "";
    else if (c.children) out += extractTextFromChildren(c.children);
  }
  return out;
};

const isWhitespaceTextNode = (node: EnrichedNode): boolean =>
  node.type === "text" && typeof node.value === "string" && node.value.trim() === "";

const renderTextNode = (
  node: EnrichedNode,
  registry: PluginRegistry,
  key: string,
  allowInlineMath: boolean,
): React.ReactNode => {
  const text = node.value ?? "";
  if (!allowInlineMath || !text.includes("$")) {
    return text;
  }

  const mathPlugin = registry.get("math") as MathInlinePlugin | undefined;
  if (!mathPlugin?.component) {
    return text;
  }

  const segments = splitInlineMath(text);
  if (!segments.some((segment) => segment.type === "math")) {
    return text;
  }

  return segments.map((segment, index) => {
    if (segment.type === "text") {
      return <React.Fragment key={`${key}.text.${index}`}>{segment.value}</React.Fragment>;
    }

    const inlineNode: EnrichedNode = {
      type: "element",
      tagName: "span",
      blockId: node.blockId,
      blockType: node.blockType,
      transformedBy: "math",
      pluginData: {
        latex: segment.value,
        displayMode: false,
        renderer: mathPlugin.rendererName ?? "katex",
      },
      children: [
        {
          type: "text",
          value: segment.value,
          blockId: node.blockId,
          blockType: node.blockType,
        },
      ],
    };

    const InlineMath = mathPlugin.component;
    return <InlineMath key={`${key}.math.${index}`} node={inlineNode} isStreaming={false} />;
  });
};

const toReactProps = (
  properties: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> => {
  const props: Record<string, unknown> = { key };
  if (!properties) return props;

  const revealTick = properties["data-inkset-reveal-tick"];
  const revealIndex = properties["data-inkset-reveal-index"];
  if (
    properties["data-inkset-reveal-token"] === "" &&
    typeof revealTick === "string" &&
    typeof revealIndex === "string"
  ) {
    // Force each freshly revealed token span to remount on every pipeline tick.
    // Without this, long plain-text runs reuse the same <span> DOM node at the
    // same child index, React only updates its textContent, and the CSS reveal
    // keyframes do not replay for the latest streamed word.
    props.key = `${key}.reveal.${revealTick}.${revealIndex}`;
  }

  for (const [name, value] of Object.entries(properties)) {
    if (value == null || value === false) continue;

    if (name === "className") {
      props.className = Array.isArray(value) ? value.join(" ") : value;
      continue;
    }

    props[name] = value;
  }

  return props;
};

const collectShaderTokens = (
  node: EnrichedNode,
  block: LayoutBlock,
  durationMs: number,
  out: ShaderToken[],
): void => {
  if (node.type === "element") {
    const props = node.properties;
    if (node.tagName === "span" && props?.["data-inkset-reveal-token"] === "") {
      const x = parseFloat((props["data-inkset-reveal-x"] as string) ?? "");
      const y = parseFloat((props["data-inkset-reveal-y"] as string) ?? "");
      const width = parseFloat((props["data-inkset-reveal-w"] as string) ?? "");
      const height = parseFloat((props["data-inkset-reveal-h"] as string) ?? "");
      if (
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        Number.isFinite(width) &&
        Number.isFinite(height) &&
        width > 0 &&
        height > 0
      ) {
        const style = props.style as Record<string, string | number> | undefined;
        const delayRaw = style?.["--inkset-reveal-delay"] as string | undefined;
        const delayMs = delayRaw ? parseFloat(delayRaw) : 0;
        const tickId = parseInt((props["data-inkset-reveal-tick"] as string) ?? "0", 10);
        const tokenIndex = parseInt((props["data-inkset-reveal-index"] as string) ?? "0", 10);

        out.push({
          x: block.x + x,
          y: block.y + y,
          width,
          height,
          delayMs,
          durationMs,
          tickId,
          tokenIndex,
          blockId: block.blockId,
        });
      }
    }
  }

  if (!node.children) return;
  for (const child of node.children) {
    collectShaderTokens(child as EnrichedNode, block, durationMs, out);
  }
};

type InlineMathSegment = { type: "text"; value: string } | { type: "math"; value: string };

const splitInlineMath = (text: string): InlineMathSegment[] => {
  const segments: InlineMathSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const start = findInlineMathDelimiter(text, cursor);
    if (start === -1) {
      segments.push({ type: "text", value: text.slice(cursor) });
      break;
    }

    const end = findInlineMathDelimiter(text, start + 1);
    if (end === -1) {
      segments.push({ type: "text", value: text.slice(cursor) });
      break;
    }

    if (start > cursor) {
      segments.push({ type: "text", value: text.slice(cursor, start) });
    }

    const value = text.slice(start + 1, end).trim();
    if (value) {
      segments.push({ type: "math", value });
    } else {
      segments.push({ type: "text", value: "$$" });
    }

    cursor = end + 1;
  }

  return segments;
};

const findInlineMathDelimiter = (text: string, fromIndex: number): number => {
  for (let index = fromIndex; index < text.length; index++) {
    if (text[index] !== "$") continue;
    if (text[index - 1] === "\\") continue;
    if (text[index + 1] === "$") {
      index += 1;
      continue;
    }
    return index;
  }

  return -1;
};

// ── <Inkset> component ──────────────────────────────────────────

export type InksetProps = {
  content?: string;
  streaming?: boolean;
  plugins?: InksetPlugin[];
  width?: number;
  /** Must match CSS font-family */
  font?: string;
  fontSize?: number;
  lineHeight?: number;
  blockSpacing?: BlockSpacing;
  /**
   * Insert soft hyphens for word-level line breaking. Also sets
   * `hyphens: manual` on the root so browsers honour the breaks.
   */
  hyphenation?: HyphenationOption;
  /** Sets CSS `text-wrap` on the root (e.g. `"pretty"` for browser K-P). */
  textWrap?: TextWrapOption;
  /**
   * Narrow each applicable block to the width of its longest greedy line.
   * `"headings"` is the most conservative default (headings benefit the
   * most); `"paragraphs"` covers paragraphs + blockquotes; `true` covers
   * everything text-shaped.
   */
  shrinkwrap?: ShrinkwrapOption;
  /**
   * Size multipliers for h1..h4 applied both to measurement and to the
   * `--inkset-heading-N-size` CSS variables (as `em` units). Default is
   * `[3, 2.15, 1.3, 1]`. h5 and h6 inherit h4.
   *
   * Prefer this over `theme.typography.headingSizes` when you need visuals
   * and layout to stay aligned — `theme` only drives CSS and leaves the
   * measurement layer reserving space at the default multipliers.
   */
  headingSizes?: HeadingSizeTuple;
  /** CSS font weights for h1..h4. Default `[800, 780, 720, 680]`. */
  headingWeights?: HeadingWeightTuple;
  /**
   * Line-height multipliers for h1..h4 relative to each heading's own
   * fontSize. Default `[1.05, 1.08, 1.15, 1.2]`.
   */
  headingLineHeights?: HeadingLineHeightTuple;
  /**
   * Structured theme overrides. Compiles to `--inkset-*` CSS variables on
   * the root. The `style` prop still has final say, so consumers can escape-
   * hatch any specific property after the theme is applied.
   */
  theme?: InksetTheme;
  /**
   * Skip the built-in `<style>` block that ships Inkset's default CSS.
   * Block positioning is applied inline, so layout stays correct — you
   * just inherit nothing visually. Use this when integrating into a
   * design system (Tailwind, vanilla-extract, etc.) that resets or fully
   * owns the typography cascade.
   */
  unstyled?: boolean;
  /**
   * Rendered while the pipeline is still preloading plugin dependencies
   * (shiki, katex) and measuring the first pass. If omitted, Inkset shows
   * a small centred spinner. Pass `null` to render nothing.
   */
  loadingFallback?: ReactNode;
  /**
   * Reveal configuration: token throttling, sequencing metadata, the built-in
   * CSS token renderer, and optional custom component / shader layers. Pass an
   * empty object `{}` for opinionated defaults.
   */
  reveal?: RevealProp;
  /** Optional shader registry used to resolve string shader sources. */
  shaderRegistry?: ShaderRegistry;
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
};

export const Inkset = ({
  content,
  streaming = false,
  plugins,
  width,
  font,
  fontSize,
  lineHeight,
  blockSpacing,
  hyphenation,
  textWrap,
  shrinkwrap,
  headingSizes,
  headingWeights,
  headingLineHeights,
  theme,
  unstyled,
  loadingFallback,
  reveal,
  shaderRegistry,
  className,
  style,
  children,
}: InksetProps) => {
  const { state, registry, pipelineVersion, containerRef, setContent, endStream, getGlyphLookup } =
    useInkset({
      plugins,
      width,
      font,
      fontSize,
      lineHeight,
      blockSpacing,
      hyphenation,
      shrinkwrap,
      headingSizes,
      headingWeights,
      headingLineHeights,
    });

  // Reveal config — memoized so stable refs feed the rendering + effect deps.
  // Intentionally not depending on `reveal` object identity: consumers pass
  // inline literals often, so we key on concrete fields.
  const revealThrottleDelay =
    reveal?.throttle === false ? -1 : reveal?.throttle?.delayInMs ?? (reveal ? 30 : -1);
  const revealThrottleChunking =
    reveal?.throttle === false ? "word" : reveal?.throttle?.chunking ?? "word";
  const revealTimelineDuration =
    reveal?.timeline === false ? -1 : reveal?.timeline?.durationMs ?? (reveal ? 320 : -1);
  const revealTimelineStagger =
    reveal?.timeline === false ? -1 : reveal?.timeline?.stagger ?? (reveal ? 30 : -1);
  const revealTimelineSep = reveal?.timeline === false ? "word" : reveal?.timeline?.sep ?? "word";
  const revealTimelineOrder =
    reveal?.timeline === false ? "layout" : reveal?.timeline?.order ?? "layout";
  const revealTimelineMaxSpan =
    reveal?.timeline === false ? -1 : reveal?.timeline?.maxSpanMs ?? (reveal ? 400 : -1);
  const revealCssPreset = reveal?.css === false ? false : reveal?.css?.preset;
  const revealCssEasing = reveal?.css === false ? false : reveal?.css?.easing;
  const revealShaderSignature = shaderConfigSignature(reveal?.shader);
  const revealIsUndefined = reveal === undefined;
  const revealConfig = useMemo(
    () => resolveRevealConfig(reveal),
    // Order matters for perf — this runs on every render if deps change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      revealThrottleDelay,
      revealThrottleChunking,
      revealTimelineDuration,
      revealTimelineStagger,
      revealTimelineSep,
      revealTimelineOrder,
      revealTimelineMaxSpan,
      revealCssPreset,
      revealCssEasing,
      revealShaderSignature,
      reveal?.component,
      revealIsUndefined,
    ],
  );

  // Throttled content mirrors the `content` prop but only advances at the
  // gate's cadence. When throttling is disabled it passes through unchanged.
  const [displayedContent, setDisplayedContent] = useState<string | undefined>(
    revealConfig.throttle ? "" : content,
  );
  const [revealDrainActive, setRevealDrainActive] = useState(false);
  const tokenGateRef = useRef<TokenGate | null>(null);
  const shaderCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const shaderInstanceRef = useRef<ShaderInstance | null>(null);
  const shaderDisabledRef = useRef(false);
  const pendingShaderTokensRef = useRef<ShaderToken[]>([]);
  const lastShaderEmitTickRef = useRef<number>(-1);
  const lastPushedContentRef = useRef<string>("");
  // Tracks whether the current document is in a throttled stream session.
  // Stays true for the streaming -> settled transition so the final append can
  // drain through the gate instead of fast-forwarding and replaying reveal.
  const streamSessionActiveRef = useRef(false);
  // Handle for the post-drain hold that keeps the reveal session alive long
  // enough for the tail chunk's wrap tick + blur-in keyframes to play out
  // before data-inkset-reveal is torn down. Cleared on re-entry or unmount.
  const drainHoldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealThrottleConfig = revealConfig.throttle;
  const shaderTokenBatchRef = useRef<ShaderToken[]>([]);

  // Build / rebuild the gate when throttle config changes.
  useEffect(() => {
    if (!revealThrottleConfig) {
      tokenGateRef.current = null;
      setRevealDrainActive(false);
      return;
    }
    const gate = createTokenGate({
      delayInMs: revealThrottleConfig.delayInMs,
      chunking: revealThrottleConfig.chunking,
      onEmit: (chunk) => {
        setDisplayedContent((prev) => (prev ?? "") + chunk);
      },
    });
    tokenGateRef.current = gate;
    return () => {
      gate.reset();
    };
  }, [revealThrottleConfig]);

  // Feed external content through the gate (or pass through if no throttle).
  useEffect(() => {
    if (content === undefined) return;
    if (!revealConfig.throttle) {
      setDisplayedContent(content);
      lastPushedContentRef.current = content;
      streamSessionActiveRef.current = false;
      setRevealDrainActive(false);
      return;
    }

    const prev = lastPushedContentRef.current;
    if (content === prev) return;

    const grewMonotonically = content.startsWith(prev);
    const continuingStream = streaming || streamSessionActiveRef.current;

    // Hard document replacement: reset and fast-forward.
    if (!grewMonotonically) {
      tokenGateRef.current?.reset();
      streamSessionActiveRef.current = streaming;
      lastPushedContentRef.current = content;
      setDisplayedContent(content);
      setRevealDrainActive(false);
      return;
    }

    // Static / non-stream content should still appear fully. The only
    // non-streaming monotonic append we preserve is the tail end of a stream
    // session that just flipped to settled.
    if (!continuingStream) {
      lastPushedContentRef.current = content;
      setDisplayedContent(content);
      setRevealDrainActive(false);
      return;
    }

    if (streaming) {
      streamSessionActiveRef.current = true;
      setRevealDrainActive(false);
    }

    const delta = content.slice(prev.length);
    lastPushedContentRef.current = content;
    if (delta.length > 0) {
      tokenGateRef.current?.push(delta);
    }
  }, [content, streaming, revealConfig.throttle]);

  // Flush the gate when streaming ends so the tail chunk (which may lack a
  // trailing word boundary) makes it to the pipeline.
  useEffect(() => {
    if (streaming || !tokenGateRef.current || !streamSessionActiveRef.current) {
      return;
    }
    const gate = tokenGateRef.current;
    const timeline = revealConfig.timeline;
    const revealTokenEffectsConfigured =
      timeline != null &&
      (revealConfig.css != null || revealConfig.component != null || revealConfig.shader != null);
    if (revealTokenEffectsConfigured) {
      setRevealDrainActive(true);
    }

    let cancelled = false;
    void gate.flush().finally(() => {
      if (cancelled || tokenGateRef.current !== gate) return;
      // The last emit inside drainTick scheduled a setDisplayedContent, and
      // .finally runs as a microtask chained to that same resolve. If we
      // flip the session off here synchronously, React batches both updates
      // into a single render where revealSessionActive has already gone
      // false — the wrap pass skips, the tail tokens never get
      // data-inkset-reveal-token spans, and the blur-in never triggers.
      //
      // Defer via setTimeout so the final content render commits first
      // (wrap tick runs with reveal effects still on, CSS selector
      // matches, animations kick off). Hold for one animation lifetime
      // so the keyframes play out before data-inkset-reveal is torn down
      // and the CSS selector stops matching.
      const holdMs = timeline ? timeline.durationMs + timeline.maxSpanMs : 0;
      drainHoldTimeoutRef.current = setTimeout(() => {
        drainHoldTimeoutRef.current = null;
        if (cancelled || tokenGateRef.current !== gate) return;
        streamSessionActiveRef.current = false;
        if (revealTokenEffectsConfigured) {
          setRevealDrainActive(false);
        }
      }, holdMs);
    });

    return () => {
      cancelled = true;
      if (drainHoldTimeoutRef.current !== null) {
        clearTimeout(drainHoldTimeoutRef.current);
        drainHoldTimeoutRef.current = null;
      }
    };
  }, [
    streaming,
    revealConfig.timeline,
    revealConfig.css,
    revealConfig.component,
    revealConfig.shader,
  ]);

  const effectiveContent = revealConfig.throttle ? displayedContent : content;

  const prevContentRef = useRef<{
    content?: string;
    pipelineVersion?: number;
  }>({});
  const [resolvedHeights, setResolvedHeights] = useState<Map<number, ResolvedBlockHeight>>(
    () => new Map(),
  );
  const observedHeightsRef = useRef<ObservedHeightCache>(new Map());
  const pendingHeightUpdatesRef = useRef<Map<number, ResolvedBlockHeight>>(new Map());
  const heightFlushFrameRef = useRef<number | ReturnType<typeof setTimeout> | null>(null);

  // Reveal bookkeeping. All refs (not state) because advancing them must not
  // retrigger renders — the render cycle reads them, then the layout effect
  // commits new values for the next cycle.
  //
  //   revealedOffsetsRef      — per-block: chars already fully revealed.
  //                             Source of truth for "what has been animated".
  //   pendingRevealOffsetsRef — per-block: chars reached THIS tick. Committed
  //                             into revealedOffsets after render.
  //   wrapCacheRef / wrapCacheTickRef
  //                           — caches wrapped nodes per (blockId, tick) so
  //                             multiple renders within one pipeline tick
  //                             (width updates, strict-mode double-render,
  //                             React concurrent re-renders) reuse the same
  //                             wrap output instead of recomputing with the
  //                             already-advanced offsets (which would produce
  //                             empty wraps and drop the reveal spans).
  const revealedOffsetsRef = useRef<Map<number, number>>(new Map());
  const pendingRevealOffsetsRef = useRef<Map<number, number>>(new Map());
  const lastProcessedRevealTickRef = useRef<number>(-1);
  const wrapCacheRef = useRef<Map<number, EnrichedNode>>(new Map());
  const wrapCacheTickRef = useRef<number>(-1);

  useEffect(() => {
    if (effectiveContent === undefined) return;
    if (
      prevContentRef.current.content === effectiveContent &&
      prevContentRef.current.pipelineVersion === pipelineVersion
    ) {
      return;
    }

    const prevContent = prevContentRef.current.content;
    const prevPipelineVersion = prevContentRef.current.pipelineVersion;
    const grewMonotonically = prevContent !== undefined && effectiveContent.startsWith(prevContent);
    const continuingRevealSession = streaming || streamSessionActiveRef.current;
    const replacedDocument =
      prevPipelineVersion !== pipelineVersion ||
      prevContent === undefined ||
      !grewMonotonically ||
      (!continuingRevealSession && effectiveContent !== prevContent);

    if (replacedDocument) {
      observedHeightsRef.current = new Map();
      pendingHeightUpdatesRef.current.clear();
      setResolvedHeights(new Map());
      // Reset the reveal offsets map on a hard content replacement. Without
      // this, a fresh document would inherit stale per-block offsets and
      // suppress the reveal animation entirely.
      revealedOffsetsRef.current = new Map();
    }

    prevContentRef.current = { content: effectiveContent, pipelineVersion };
    setContent(effectiveContent);
  }, [effectiveContent, pipelineVersion, setContent, streaming]);

  useEffect(() => {
    if (!streaming && prevContentRef.current.content !== undefined) {
      endStream();
    }
  }, [streaming, endStream]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const copyHandler = createCopyHandler(registry);
    return copyHandler.attach(container);
  }, [registry, containerRef]);

  useEffect(() => {
    if (!state) return;

    const currentBlocks = new Map(
      state.layout.map((block) => [block.blockId, { node: block.node, width: block.width }]),
    );

    setResolvedHeights((prev) => {
      let changed = false;
      const next = new Map<number, ResolvedBlockHeight>();
      const nextObservedHeights: ObservedHeightCache = new Map();

      for (const [blockId, value] of prev) {
        const currentBlock = currentBlocks.get(blockId);
        if (!currentBlock) {
          changed = true;
          continue;
        }

        if (currentBlock.node === value.node) {
          next.set(blockId, value);
        } else if (streaming && currentBlock.width === value.width) {
          changed = true;
          next.set(blockId, {
            ...value,
            node: currentBlock.node,
            width: currentBlock.width,
          });
        } else {
          changed = true;
        }

        const observedWidths = observedHeightsRef.current.get(blockId);
        if (observedWidths) {
          nextObservedHeights.set(blockId, new Map(observedWidths));
        }
      }

      observedHeightsRef.current = nextObservedHeights;
      return changed ? next : prev;
    });
  }, [state, streaming]);

  const flushPendingHeightUpdates = useCallback(() => {
    heightFlushFrameRef.current = null;

    setResolvedHeights((prev) => {
      const pending = pendingHeightUpdatesRef.current;
      if (pending.size === 0) {
        return prev;
      }

      let changed = false;
      const next = new Map(prev);

      for (const [blockId, value] of pending) {
        const existing = next.get(blockId);
        if (
          existing &&
          existing.node === value.node &&
          existing.width === value.width &&
          existing.height === value.height
        ) {
          continue;
        }

        next.set(blockId, value);
        let cachedByWidth = observedHeightsRef.current.get(blockId);
        if (!cachedByWidth) {
          cachedByWidth = new Map();
          observedHeightsRef.current.set(blockId, cachedByWidth);
        }
        cachedByWidth.set(value.width, value.height);
        changed = true;
      }

      pending.clear();
      return changed ? next : prev;
    });
  }, []);

  const scheduleHeightFlush = useCallback(() => {
    if (heightFlushFrameRef.current !== null) return;

    if (typeof requestAnimationFrame !== "undefined") {
      heightFlushFrameRef.current = requestAnimationFrame(() => {
        flushPendingHeightUpdates();
      });
      return;
    }

    heightFlushFrameRef.current = setTimeout(() => {
      flushPendingHeightUpdates();
    }, 0);
  }, [flushPendingHeightUpdates]);

  useEffect(() => {
    return () => {
      if (heightFlushFrameRef.current === null) {
        return;
      }

      if (typeof heightFlushFrameRef.current === "number") {
        cancelAnimationFrame(heightFlushFrameRef.current);
      } else {
        clearTimeout(heightFlushFrameRef.current);
      }
    };
  }, []);

  const handleHeightChange = useCallback(
    (
      blockId: number,
      node: EnrichedNode,
      width: number,
      height: number,
      priority: "sync" | "deferred" = "deferred",
    ) => {
      const nextValue = { node, width, height };

      let cachedByWidth = observedHeightsRef.current.get(blockId);
      if (!cachedByWidth) {
        cachedByWidth = new Map();
        observedHeightsRef.current.set(blockId, cachedByWidth);
      }
      const cachedHeight = cachedByWidth.get(width);

      if (priority === "deferred" && cachedHeight !== undefined && height <= cachedHeight) {
        return;
      }

      cachedByWidth.set(width, height);

      if (priority === "deferred") {
        pendingHeightUpdatesRef.current.set(blockId, nextValue);
        scheduleHeightFlush();
        return;
      }

      setResolvedHeights((prev) => {
        const existing = prev.get(blockId);
        if (
          existing &&
          existing.node === node &&
          existing.width === width &&
          existing.height === height
        ) {
          return prev;
        }

        const next = new Map(prev);
        next.set(blockId, nextValue);
        return next;
      });
    },
    [scheduleHeightFlush],
  );

  const spacing = blockSpacing ?? DEFAULT_BLOCK_SPACING;
  const resolvedLayout = state
    ? resolveLayout(state.layout, resolvedHeights, observedHeightsRef.current, spacing)
    : [];
  const resolvedHeight =
    resolvedLayout.length > 0 ? getLayoutHeight(resolvedLayout) : state?.totalHeight ?? 0;

  // Compute delta-wrapped render nodes for blocks that opted into animation.
  // Cached per (tick, blockId) so subsequent renders within the same pipeline
  // tick (e.g. width resize, React strict-mode double-render, concurrent
  // re-render) emit the same wrapped tree instead of producing empty wraps
  // from already-advanced offsets.
  const currentRevealTick = state?.tick ?? -1;
  const displayNodes = new Map<number, EnrichedNode>();
  const shaderTokenBatch: ShaderToken[] = [];
  let pendingAriaMirrorText = "";
  const timelineConfig = revealConfig.timeline;
  const cssRevealConfig = revealConfig.css;
  const revealSessionActive = streaming || streamSessionActiveRef.current || revealDrainActive;
  const revealTokenEffectsConfigured =
    timelineConfig != null &&
    (cssRevealConfig != null || revealConfig.component != null || revealConfig.shader != null);
  const revealTokenEffectsActive = revealTokenEffectsConfigured && revealSessionActive;
  const defaultCssRevealActive =
    timelineConfig != null &&
    cssRevealConfig != null &&
    revealConfig.component == null &&
    revealSessionActive;
  if (revealTokenEffectsActive && state) {
    const isNewTick = currentRevealTick !== wrapCacheTickRef.current;
    if (isNewTick) {
      wrapCacheRef.current = new Map();
      wrapCacheTickRef.current = currentRevealTick;
      pendingRevealOffsetsRef.current = new Map();
    }
    for (const block of resolvedLayout) {
      if (block.node.transformedBy) {
        // Plugins own their DOM — no delta wrapping inside their subtrees.
        // (Block-level entrance animation is a later phase.)
        continue;
      }

      const cached = wrapCacheRef.current.get(block.blockId);
      if (cached !== undefined) {
        // Second render for the same tick — reuse.
        if (cached !== block.node) {
          displayNodes.set(block.blockId, cached);
          if (revealConfig.shader) {
            collectShaderTokens(cached, block, timelineConfig?.durationMs ?? 320, shaderTokenBatch);
          }
        }
        continue;
      }

      const prevOffset = revealedOffsetsRef.current.get(block.blockId) ?? 0;
      // Phase 3: build a glyph lookup per block so the wrap's second pass can
      // sort by (y, x) and stash coords on each span. `getGlyphLookup` returns
      // null when pretext hasn't loaded or the environment has no Canvas;
      // wrap.ts falls through to arrival-order delays in that case.
      const wrapStaggerOrder = timelineConfig?.order ?? "layout";
      const glyphLookup =
        wrapStaggerOrder === "layout" ? getGlyphLookup(block.node, block.width) : null;
      const { node: wrapped, newOffset } = wrapBlockDelta(block.node, {
        revealedOffset: prevOffset,
        tickId: currentRevealTick,
        staggerMs: timelineConfig?.stagger ?? 30,
        sep: timelineConfig?.sep ?? "word",
        staggerOrder: wrapStaggerOrder,
        maxStaggerSpanMs: timelineConfig?.maxSpanMs ?? 400,
        glyphLookup,
      });
      wrapCacheRef.current.set(block.blockId, wrapped);
      if (wrapped !== block.node) {
        displayNodes.set(block.blockId, wrapped);
        if (revealConfig.shader) {
          collectShaderTokens(wrapped, block, timelineConfig?.durationMs ?? 320, shaderTokenBatch);
        }
      }
      pendingRevealOffsetsRef.current.set(block.blockId, newOffset);
    }
    // Build aria mirror text from original (unwrapped) nodes so screen readers
    // announce coherent block content instead of tokenised span runs.
    pendingAriaMirrorText = resolvedLayout.map((block) => extractText(block.node)).join("\n\n");
  }
  shaderTokenBatchRef.current = shaderTokenBatch;

  // Commit pending reveal offsets after each pipeline tick. Gated on
  // lastProcessedRevealTickRef so strict-mode double-render / interleaved
  // width renders don't double-advance.
  useLayoutEffect(() => {
    if (!revealTokenEffectsConfigured) return;
    if (currentRevealTick === lastProcessedRevealTickRef.current) return;
    lastProcessedRevealTickRef.current = currentRevealTick;
    for (const [id, offset] of pendingRevealOffsetsRef.current) {
      revealedOffsetsRef.current.set(id, offset);
    }
  }, [currentRevealTick, revealTokenEffectsConfigured]);

  // The hot block (last during streaming) uses normal document flow so CSS
  // handles its height natively, avoiding measurement race conditions
  const hotBlockIndex = streaming && resolvedLayout.length > 0 ? resolvedLayout.length - 1 : -1;
  const frozenBlocks = hotBlockIndex >= 0 ? resolvedLayout.slice(0, hotBlockIndex) : resolvedLayout;
  const hotBlock = hotBlockIndex >= 0 ? resolvedLayout[hotBlockIndex] : null;

  // Pushes the normal-flow hot block below the absolute-positioned frozen blocks
  const spacerHeight = hotBlock ? hotBlock.y : 0;

  const containerMinHeight = hotBlock ? undefined : resolvedHeight || (state?.totalHeight ?? 0);

  const baseFontSize = fontSize ?? DEFAULT_FONT_SIZE;
  const baseLineHeight = lineHeight ?? DEFAULT_LINE_HEIGHT;
  const baseLineHeightRatio =
    baseFontSize > 0 ? baseLineHeight / baseFontSize : DEFAULT_LINE_HEIGHT_RATIO;

  // Precedence (low → high): CSS defaults in INKSET_STYLES → font/fontSize/
  // lineHeight props → heading tuple props → `theme` prop → `style` prop.
  // Heading tuple props go *before* `theme` so that a structured theme override
  // can still win, but *after* the font props so they override the base-size
  // em calculation. Theme before style means consumers can escape-hatch any
  // single property without building a whole theme variant.
  const containerStyle: React.CSSProperties & Record<`--${string}`, string | number> = {
    position: "relative",
    overflow: "hidden",
    minHeight: containerMinHeight,
    "--inkset-font-family": font ?? "system-ui, sans-serif",
    "--inkset-base-font-size": `${baseFontSize}px`,
    "--inkset-base-line-height-ratio": `${baseLineHeightRatio}`,
    ...headingTuplesToCssVars(headingSizes, headingWeights, headingLineHeights),
    ...themeToCssVars(theme),
    hyphens: hyphenation ? "manual" : undefined,
    WebkitHyphens: hyphenation ? "manual" : undefined,
    overflowWrap: hyphenation ? "break-word" : undefined,
    textWrap,
    ...(timelineConfig && cssRevealConfig
      ? {
          "--inkset-reveal-display":
            cssRevealConfig.preset === "fadeIn" ? "inline" : "inline-block",
          "--inkset-reveal-name": presetToKeyframeName(cssRevealConfig.preset),
          "--inkset-reveal-duration": `${timelineConfig.durationMs}ms`,
          "--inkset-reveal-easing": cssRevealConfig.easing,
        }
      : {}),
    ...style,
  };

  // Pipeline is still preloading plugin deps + running the first measure.
  // Only show the fallback when we actually have content to render; empty
  // Inkset instances stay empty.
  const isLoading = state === null && content !== undefined && content.length > 0;
  const fallbackNode = loadingFallback === undefined ? <InksetDefaultLoading /> : loadingFallback;
  const resolvedShaderRegistry = shaderRegistry ?? defaultShaderRegistry;
  const disposeShaderInstance = useCallback(() => {
    shaderInstanceRef.current?.dispose();
    shaderInstanceRef.current = null;
  }, []);

  const resizeShaderCanvas = useCallback(() => {
    if (!revealConfig.shader || !timelineConfig) return;
    const canvas = shaderCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const cssWidth = Math.max(1, Math.ceil(container.getBoundingClientRect().width));
    const cssHeight = Math.max(1, Math.ceil(resolvedHeight || state?.totalHeight || 0));
    const dpr = window.devicePixelRatio || 1;
    const nextWidth = Math.max(1, Math.round(cssWidth * dpr));
    const nextHeight = Math.max(1, Math.round(cssHeight * dpr));

    if (canvas.width !== nextWidth) {
      canvas.width = nextWidth;
    }
    if (canvas.height !== nextHeight) {
      canvas.height = nextHeight;
    }
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
  }, [containerRef, revealConfig.shader, resolvedHeight, state?.totalHeight, timelineConfig]);

  useLayoutEffect(() => {
    if (!revealConfig.shader || !timelineConfig) return;
    resizeShaderCanvas();
  }, [revealConfig.shader, resizeShaderCanvas, timelineConfig]);

  useEffect(() => {
    if (!revealConfig.shader || !timelineConfig) {
      shaderDisabledRef.current = false;
      pendingShaderTokensRef.current = [];
      lastShaderEmitTickRef.current = -1;
      disposeShaderInstance();
      return;
    }

    const container = containerRef.current;
    const canvas = shaderCanvasRef.current;
    if (!container || !canvas) return;

    let cancelled = false;
    const shaderConfig = revealConfig.shader;
    shaderDisabledRef.current = false;
    resizeShaderCanvas();

    void resolveShaderSource(shaderConfig.source, resolvedShaderRegistry)
      .then((preset) => {
        if (!preset || cancelled) return null;
        return preset.init(container, {
          canvas,
          dpr: window.devicePixelRatio || 1,
          options: shaderConfig.options,
        });
      })
      .then((instance) => {
        if (!instance) {
          if (!cancelled) {
            shaderDisabledRef.current = true;
            pendingShaderTokensRef.current = [];
          }
          return;
        }
        if (cancelled) {
          instance.dispose();
          return;
        }
        disposeShaderInstance();
        shaderInstanceRef.current = instance;
        if (pendingShaderTokensRef.current.length > 0) {
          instance.emit(pendingShaderTokensRef.current);
          pendingShaderTokensRef.current = [];
        }
      })
      .catch(() => {
        if (!cancelled) {
          shaderDisabledRef.current = true;
          pendingShaderTokensRef.current = [];
          disposeShaderInstance();
        }
      });

    return () => {
      cancelled = true;
      disposeShaderInstance();
    };
  }, [
    containerRef,
    disposeShaderInstance,
    revealConfig.shader,
    revealShaderSignature,
    resolvedShaderRegistry,
    resizeShaderCanvas,
    timelineConfig,
  ]);

  useEffect(() => {
    if (!revealConfig.shader || !timelineConfig) return;
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      resizeShaderCanvas();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, revealConfig.shader, resizeShaderCanvas, timelineConfig]);

  useLayoutEffect(() => {
    if (!revealConfig.shader || !timelineConfig) return;
    const tokenBatch = shaderTokenBatchRef.current;
    if (tokenBatch.length === 0) return;
    if (currentRevealTick === lastShaderEmitTickRef.current) return;

    lastShaderEmitTickRef.current = currentRevealTick;
    if (shaderDisabledRef.current) {
      return;
    }
    const instance = shaderInstanceRef.current;
    if (instance) {
      instance.emit(tokenBatch);
    } else {
      pendingShaderTokensRef.current.push(...tokenBatch);
    }
  }, [currentRevealTick, revealConfig.shader, timelineConfig]);

  // When reveal token effects are active, per-token wrappers would otherwise
  // fragment `aria-live`. We move announcements to a visually-hidden mirror
  // carrying the original block text and keep visible content aria-hidden.
  return (
    <div
      ref={containerRef}
      className={className ? `inkset-root ${className}` : "inkset-root"}
      style={containerStyle}
      role="log"
      aria-live={revealTokenEffectsActive ? undefined : "polite"}
      aria-atomic={false}
      aria-busy={streaming || isLoading}
      aria-hidden={revealTokenEffectsActive ? true : undefined}
      data-inkset-reveal={defaultCssRevealActive ? "" : undefined}
    >
      {!unstyled && <style>{INKSET_STYLES}</style>}

      {isLoading && fallbackNode}

      {revealConfig.shader && timelineConfig && (
        <canvas
          ref={shaderCanvasRef}
          aria-hidden
          data-inkset-shader-overlay=""
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: Math.max(1, resolvedHeight || state?.totalHeight || 0),
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      )}

      {frozenBlocks.map((block: LayoutBlock) => (
        <BlockRenderer
          key={block.blockId}
          block={block}
          registry={registry}
          isStreaming={false}
          positioning="absolute"
          observeHeight
          onHeightChange={handleHeightChange}
          displayNode={displayNodes.get(block.blockId)}
          revealComponent={revealConfig.component}
          revealDurationMs={timelineConfig?.durationMs ?? 320}
        />
      ))}

      {hotBlock && (
        <>
          <div
            aria-hidden
            style={{
              height: spacerHeight,
              pointerEvents: "none",
            }}
          />
          <BlockRenderer
            key={hotBlock.blockId}
            block={hotBlock}
            registry={registry}
            isStreaming={true}
            positioning="flow"
            observeHeight
            onHeightChange={handleHeightChange}
            displayNode={displayNodes.get(hotBlock.blockId)}
            revealComponent={revealConfig.component}
            revealDurationMs={timelineConfig?.durationMs ?? 320}
          />
        </>
      )}

      {revealTokenEffectsActive && (
        <div className="inkset-aria-mirror" role="status" aria-live="polite" aria-atomic={false}>
          {pendingAriaMirrorText}
        </div>
      )}

      {children}
    </div>
  );
};

export type {
  InksetPlugin,
  InksetOptions,
  BlockSpacing,
  BlockSpacingPairRule,
  BlockSpacingValue,
  HyphenationOption,
  TextWrapOption,
  PluginComponentProps,
  PipelineState,
  PipelineMetrics,
  EnrichedNode,
  ASTNode,
  BuiltinBlockKind,
  LayoutBlock,
  LayoutTree,
} from "@inkset/core";

export { themeToCssVars } from "./theme";
export type { InksetTheme, HeadingTuple, InksetCssVars } from "./theme";

export { createShaderRegistry, defaultShaderRegistry } from "@inkset/animate";

export type {
  RevealProp,
  ThrottleOptions,
  TimelineOptions,
  CssRevealOptions,
  CssRevealPreset,
  ChunkingMode,
  StaggerOrder,
  RevealComponent,
  RevealComponentProps,
  ShaderRegistry,
  ShaderPreset,
  ShaderLoader,
  ShaderSource,
  ShaderConfig,
} from "@inkset/animate";

export type { TokenCoord, GlyphPositionLookup } from "@inkset/core";
