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
  type PipelineState,
  type InksetOptions,
  type HyphenationOption,
  type LayoutBlock,
  type EnrichedNode,
  type InksetPlugin,
  type TextWrapOption,
} from "@inkset/core";
import { createCopyHandler } from "./copy";

const DEFAULT_BLOCK_MARGIN = 16;
const DEFAULT_FONT_SIZE = 16;
const DEFAULT_LINE_HEIGHT = 24;
const DEFAULT_LINE_HEIGHT_RATIO = 1.5;

const INKSET_STYLES = `
  .inkset-root {
    color: #e8e8eb;
    font-family: var(--inkset-font-family, system-ui, sans-serif);
    font-size: var(--inkset-base-font-size, 16px);
    line-height: var(--inkset-base-line-height-ratio, 1.5);
  }

  .inkset-root > [data-block-id] {
    left: 0;
    top: 0;
  }

  .inkset-root h1,
  .inkset-root h2,
  .inkset-root h3,
  .inkset-root h4,
  .inkset-root h5,
  .inkset-root h6,
  .inkset-root p,
  .inkset-root pre,
  .inkset-root blockquote,
  .inkset-root ul,
  .inkset-root ol,
  .inkset-root table {
    margin: 0;
  }

  .inkset-root h1 {
    font-size: 3em;
    line-height: 1.05;
    letter-spacing: -0.04em;
    font-weight: 800;
  }

  .inkset-root h2 {
    font-size: 2.15em;
    line-height: 1.08;
    letter-spacing: -0.035em;
    font-weight: 780;
  }

  .inkset-root h3 {
    font-size: 1.3em;
    line-height: 1.15;
    letter-spacing: -0.02em;
    font-weight: 720;
  }

  .inkset-root h4,
  .inkset-root h5,
  .inkset-root h6 {
    font-size: 1em;
    line-height: 1.2;
    font-weight: 680;
  }

  .inkset-root p,
  .inkset-root li,
  .inkset-root blockquote {
    font-size: 1em;
    line-height: var(--inkset-base-line-height-ratio, 1.5);
  }

  .inkset-root ul,
  .inkset-root ol {
    padding-left: 1.4em;
  }

  .inkset-root blockquote {
    padding-left: 1em;
    border-left: 3px solid rgba(255, 255, 255, 0.18);
    color: rgba(232, 232, 235, 0.78);
  }

  .inkset-root hr {
    margin: 0;
    border: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .inkset-root code:not(pre code) {
    padding: 0.15em 0.35em;
    border-radius: 0.35em;
    background: rgba(255, 255, 255, 0.08);
    font-family: ui-monospace, monospace;
    font-size: 0.92em;
  }

  .inkset-root .inkset-default-block {
    width: 100%;
  }

  .inkset-root .inkset-code-block,
  .inkset-root .inkset-table-block,
  .inkset-root .inkset-math {
    width: 100%;
  }

  .inkset-root .inkset-code-content pre,
  .inkset-root .inkset-code-content .shiki {
    margin: 0;
    padding: 12px 16px;
    overflow-x: auto;
    border-radius: 14px;
    background: #24292e !important;
    font-size: 14px;
    line-height: 1.5;
  }

  .inkset-root .inkset-code-content code {
    background: transparent;
    padding: 0;
    border-radius: 0;
  }

  .inkset-root .inkset-table-scroll table {
    width: max-content;
    min-width: 100%;
    border-collapse: collapse;
  }

  .inkset-root .inkset-table-scroll th,
  .inkset-root .inkset-table-scroll td {
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    text-align: left;
    white-space: nowrap;
  }

  .inkset-root .inkset-table-scroll th {
    color: rgba(232, 232, 235, 0.72);
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
`;

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
  const children = node.children?.map((child, index) =>
    renderAstNode(
      child as EnrichedNode,
      registry,
      `${key}.${index}`,
      nextAllowInlineMath,
    ),
  );

  return React.createElement(tagName, props, ...(children ?? []));
};

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

  const containerStyle: React.CSSProperties & Record<`--${string}`, string | number> = {
    position: "relative",
    overflow: "hidden",
    minHeight: containerMinHeight,
    "--inkset-font-family": font ?? "system-ui, sans-serif",
    "--inkset-base-font-size": `${baseFontSize}px`,
    "--inkset-base-line-height-ratio": `${baseLineHeightRatio}`,
    hyphens: hyphenation ? "manual" : undefined,
    WebkitHyphens: hyphenation ? "manual" : undefined,
    overflowWrap: hyphenation ? "break-word" : undefined,
    textWrap,
    ...style,
  };

  return (
    <div
      ref={containerRef}
      className={className ? `inkset-root ${className}` : "inkset-root"}
      style={containerStyle}
      role="log"
      aria-live="polite"
      aria-atomic={false}
      aria-busy={streaming}
    >
      <style>{INKSET_STYLES}</style>

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
