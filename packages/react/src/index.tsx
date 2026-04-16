// React bindings for inkset: the <Inkset> component, useInkset hook, and block renderer.
import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  memo,
  type ReactNode,
} from "react";
import {
  StreamingPipeline,
  PluginRegistry,
  DEFAULT_HEADING_SIZES,
  DEFAULT_HEADING_WEIGHTS,
  DEFAULT_HEADING_LINE_HEIGHTS,
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
} from "@inkset/core";
import { createCopyHandler } from "./copy";
import { themeToCssVars, type InksetTheme } from "./theme";

const DEFAULT_BLOCK_MARGIN = 16;
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
    --inkset-table-header-tracking: 0.05em;
    --inkset-table-header-padding: 2px 8px;
    --inkset-math-display-padding: 8px 0;
    --inkset-math-display-line-height: 1.2;
    --inkset-math-display-radius: 0;
    --inkset-math-raw-font-size: 14px;
    --inkset-math-raw-opacity: 0.6;
    --inkset-math-error-font-size: 13px;
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
    text-transform: uppercase;
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
`;

function InksetDefaultLoading() {
  return (
    <div className="inkset-loading" role="status">
      <span className="inkset-loading-spinner" aria-hidden />
      <span>Loading…</span>
    </div>
  );
}

type ResolvedBlockHeight = {
  height: number;
  node: EnrichedNode;
  width: number;
};

const resolveLayout = (
  layout: readonly LayoutBlock[],
  heightMap: ReadonlyMap<number, ResolvedBlockHeight>,
  blockMargin: number,
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
    }

    const nextBlock: LayoutBlock = {
      ...block,
      y: currentY,
      height,
    };

    currentY += height + (index < layout.length - 1 ? blockMargin : 0);
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
    options?.plugins?.map((plugin) => plugin.name).join("|") ?? "";

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
    options?.blockMargin,
    options?.cacheSize,
    hyphenationSignature(options?.hyphenation),
    options?.headingSizes?.join(",") ?? "",
    options?.headingWeights?.join(",") ?? "",
    options?.headingLineHeights?.join(",") ?? "",
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

  return {
    state,
    registry: registryRef.current,
    pipelineVersion,
    containerRef,
    appendToken,
    endStream,
    setContent,
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
};

const BlockRenderer = memo(
  function BlockRenderer({
    block,
    registry,
    isStreaming,
    positioning,
    observeHeight,
    onHeightChange,
  }: BlockRendererProps) {
    const { node, x, y, width, height } = block;
    const blockRef = useRef<HTMLDivElement>(null);

    const plugin = node.transformedBy
      ? registry.get(node.transformedBy)
      : undefined;

    const PluginComponent = plugin?.component;

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

    // Capture real DOM height so frozen absolute layout inherits it seamlessly
    useLayoutEffect(() => {
      if (!observeHeight) return;

      const element = blockRef.current;
      if (!element) return;

      const reportHeight = (priority: "sync" | "deferred") => {
        const nextHeight = Math.ceil(element.getBoundingClientRect().height);
        if (nextHeight > 0) {
          onHeightChange(block.blockId, node, width, nextHeight, priority);
        }
      };

      if (positioning === "flow") {
        reportHeight("sync");
        return;
      }

      reportHeight("deferred");

      const observer = new ResizeObserver(() => {
        reportHeight("deferred");
      });

      observer.observe(element);
      return () => observer.disconnect();
    }, [block.blockId, height, node, observeHeight, onHeightChange, positioning, width]);

    return (
      <div
        ref={blockRef}
        style={style}
        data-block-id={block.blockId}
        data-block-type={node.blockType}
        role="article"
      >
        {PluginComponent ? (
          <PluginComponent node={node} isStreaming={isStreaming} />
        ) : (
          <DefaultBlockRenderer node={node} registry={registry} />
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
    prev.onHeightChange === next.onHeightChange,
);

// ── Default block renderer ────────────────────────────────────────

type MathInlinePlugin = InksetPlugin & {
  rendererName?: string;
};

function DefaultBlockRenderer({
  node,
  registry,
}: {
  node: EnrichedNode;
  registry: PluginRegistry;
}) {
  return (
    <div className="inkset-default-block">
      {renderAstNode(node, registry, `${node.blockId}`)}
    </div>
  );
}

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
      ),
    );
  }

  const tagName = node.tagName ?? "div";
  const nextAllowInlineMath = allowInlineMath && tagName !== "code" && tagName !== "pre";
  const props = toReactProps(node.properties, key);
  const rawChildren = TABLE_CONTEXT_TAGS.has(tagName)
    ? node.children?.filter((child) => !isWhitespaceTextNode(child as EnrichedNode))
    : node.children;
  const children = rawChildren?.map((child, index) =>
    renderAstNode(
      child as EnrichedNode,
      registry,
      `${key}.${index}`,
      nextAllowInlineMath,
    ),
  );

  return React.createElement(tagName, props, ...(children ?? []));
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
      return (
        <React.Fragment key={`${key}.text.${index}`}>
          {segment.value}
        </React.Fragment>
      );
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
    return (
      <InlineMath
        key={`${key}.math.${index}`}
        node={inlineNode}
        isStreaming={false}
      />
    );
  });
};

const toReactProps = (
  properties: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> => {
  const props: Record<string, unknown> = { key };
  if (!properties) return props;

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

type InlineMathSegment =
  | { type: "text"; value: string }
  | { type: "math"; value: string };

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
  blockMargin?: number;
  /**
   * Insert soft hyphens for word-level line breaking. Also sets
   * `hyphens: manual` on the root so browsers honour the breaks.
   */
  hyphenation?: HyphenationOption;
  /** Sets CSS `text-wrap` on the root (e.g. `"pretty"` for browser K-P). */
  textWrap?: TextWrapOption;
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
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
};

export function Inkset({
  content,
  streaming = false,
  plugins,
  width,
  font,
  fontSize,
  lineHeight,
  blockMargin,
  hyphenation,
  textWrap,
  headingSizes,
  headingWeights,
  headingLineHeights,
  theme,
  unstyled,
  loadingFallback,
  className,
  style,
  children,
}: InksetProps) {
  const { state, registry, pipelineVersion, containerRef, setContent, endStream } = useInkset({
    plugins,
    width,
    font,
    fontSize,
    lineHeight,
    blockMargin,
    hyphenation,
    headingSizes,
    headingWeights,
    headingLineHeights,
  });

  const prevContentRef = useRef<{
    content?: string;
    pipelineVersion?: number;
  }>({});
  const [resolvedHeights, setResolvedHeights] = useState<Map<number, ResolvedBlockHeight>>(
    () => new Map(),
  );
  const pendingHeightUpdatesRef = useRef<Map<number, ResolvedBlockHeight>>(new Map());
  const heightFlushFrameRef = useRef<number | ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (content === undefined) return;
    if (
      prevContentRef.current.content === content &&
      prevContentRef.current.pipelineVersion === pipelineVersion
    ) {
      return;
    }

    prevContentRef.current = { content, pipelineVersion };
    setContent(content);
  }, [content, pipelineVersion, setContent]);

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
      state.layout.map((block) => [
        block.blockId,
        { node: block.node, width: block.width },
      ]),
    );

    setResolvedHeights((prev) => {
      let changed = false;
      const next = new Map<number, ResolvedBlockHeight>();

      for (const [blockId, value] of prev) {
        const currentBlock = currentBlocks.get(blockId);
        if (!currentBlock) {
          changed = true;
          continue;
        }

        if (currentBlock.node === value.node) {
          next.set(blockId, value);
          continue;
        }

        if (streaming && currentBlock.width === value.width) {
          changed = true;
          next.set(blockId, {
            ...value,
            node: currentBlock.node,
            width: currentBlock.width,
          });
        } else {
          changed = true;
        }
      }

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

  const margin = blockMargin ?? DEFAULT_BLOCK_MARGIN;
  const resolvedLayout = state
    ? resolveLayout(state.layout, resolvedHeights, margin)
    : [];
  const resolvedHeight = resolvedLayout.length > 0
    ? getLayoutHeight(resolvedLayout)
    : (state?.totalHeight ?? 0);

  // The hot block (last during streaming) uses normal document flow so CSS
  // handles its height natively, avoiding measurement race conditions
  const hotBlockIndex = streaming && resolvedLayout.length > 0
    ? resolvedLayout.length - 1
    : -1;
  const frozenBlocks = hotBlockIndex >= 0
    ? resolvedLayout.slice(0, hotBlockIndex)
    : resolvedLayout;
  const hotBlock = hotBlockIndex >= 0
    ? resolvedLayout[hotBlockIndex]
    : null;

  // Pushes the normal-flow hot block below the absolute-positioned frozen blocks
  const spacerHeight = hotBlock
    ? hotBlock.y
    : 0;

  const containerMinHeight = hotBlock
    ? undefined
    : resolvedHeight || (state?.totalHeight ?? 0);

  const baseFontSize = fontSize ?? DEFAULT_FONT_SIZE;
  const baseLineHeight = lineHeight ?? DEFAULT_LINE_HEIGHT;
  const baseLineHeightRatio = baseFontSize > 0
    ? baseLineHeight / baseFontSize
    : DEFAULT_LINE_HEIGHT_RATIO;

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
    ...style,
  };

  // Pipeline is still preloading plugin deps + running the first measure.
  // Only show the fallback when we actually have content to render; empty
  // Inkset instances stay empty.
  const isLoading = state === null && content !== undefined && content.length > 0;
  const fallbackNode =
    loadingFallback === undefined ? <InksetDefaultLoading /> : loadingFallback;

  return (
    <div
      ref={containerRef}
      className={className ? `inkset-root ${className}` : "inkset-root"}
      style={containerStyle}
      role="log"
      aria-live="polite"
      aria-atomic={false}
      aria-busy={streaming || isLoading}
    >
      {!unstyled && <style>{INKSET_STYLES}</style>}

      {isLoading && fallbackNode}

      {frozenBlocks.map((block: LayoutBlock) => (
        <BlockRenderer
          key={block.blockId}
          block={block}
          registry={registry}
          isStreaming={false}
          positioning="absolute"
          observeHeight
          onHeightChange={handleHeightChange}
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
          {frozenBlocks.length > 0 && (
            <div aria-hidden style={{ height: margin }} />
          )}
          <BlockRenderer
            key={hotBlock.blockId}
            block={hotBlock}
            registry={registry}
            isStreaming={true}
            positioning="flow"
            observeHeight
            onHeightChange={handleHeightChange}
          />
        </>
      )}

      {children}
    </div>
  );
}

export type {
  InksetPlugin,
  InksetOptions,
  HyphenationOption,
  TextWrapOption,
  PluginComponentProps,
  PipelineState,
  PipelineMetrics,
  EnrichedNode,
  ASTNode,
  LayoutBlock,
  LayoutTree,
} from "@inkset/core";

export { themeToCssVars } from "./theme";
export type { InksetTheme, HeadingTuple, InksetCssVars } from "./theme";
