import React, {
  useEffect,
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
  type PreframeOptions,
  type LayoutBlock,
  type EnrichedNode,
  type PreframePlugin,
} from "@preframe/core";
import { createCopyHandler } from "./copy";

// ── usePreframe hook ───────────────────────────────────────────────

export interface UsePreframeOptions extends PreframeOptions {
  /** Whether content is actively streaming */
  streaming?: boolean;
}

export interface UsePreframeResult {
  /** Current layout state */
  state: PipelineState | null;
  /** Plugin registry for component lookup */
  registry: PluginRegistry;
  /** Ref to attach to the container element */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Append a streaming token */
  appendToken: (token: string) => Promise<void>;
  /** End the stream */
  endStream: () => Promise<void>;
  /** Set complete content (non-streaming) */
  setContent: (content: string) => Promise<void>;
}

export function usePreframe(options?: UsePreframeOptions): UsePreframeResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const pipelineRef = useRef<StreamingPipeline | null>(null);
  const registryRef = useRef<PluginRegistry>(new PluginRegistry());
  const [state, setState] = useState<PipelineState | null>(null);

  // Create pipeline once (or when plugins change by reference)
  useEffect(() => {
    const pipeline = new StreamingPipeline(options);
    pipelineRef.current = pipeline;
    registryRef.current = pipeline.getRegistry();

    const unsubscribe = pipeline.subscribe(setState);
    pipeline.init();

    return () => {
      unsubscribe();
      pipeline.destroy();
      pipelineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.plugins]);

  // Track container width with ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    const pipeline = pipelineRef.current;
    if (!container || !pipeline) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0) {
          pipeline.setWidth(width);
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [state]); // re-attach when pipeline recreated

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
    containerRef,
    appendToken,
    endStream,
    setContent,
  };
}

// ── Block renderer ─────────────────────────────────────────────────

interface BlockRendererProps {
  block: LayoutBlock;
  registry: PluginRegistry;
  isStreaming: boolean;
}

const BlockRenderer = memo(
  function BlockRenderer({ block, registry, isStreaming }: BlockRendererProps) {
    const { node, x, y, width, height } = block;

    // Find the plugin component for this block type
    const plugin = node.transformedBy
      ? registry.get(node.transformedBy)
      : undefined;

    const PluginComponent = plugin?.component;

    const style: React.CSSProperties = {
      position: "absolute",
      transform: `translate(${x}px, ${y}px)`,
      width,
      minHeight: height,
      willChange: "transform",
    };

    return (
      <div
        style={style}
        data-block-id={block.blockId}
        data-block-type={node.blockType}
        role="article"
      >
        {PluginComponent ? (
          <PluginComponent node={node} isStreaming={isStreaming} />
        ) : (
          <DefaultBlockRenderer node={node} />
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
    prev.isStreaming === next.isStreaming,
);

// ── Default block renderer (no plugin) ─────────────────────────────

function DefaultBlockRenderer({ node }: { node: EnrichedNode }) {
  return <div dangerouslySetInnerHTML={{ __html: nodeToHtml(node) }} />;
}

function nodeToHtml(node: EnrichedNode): string {
  if (node.type === "text") return escapeHtml(node.value ?? "");
  if (node.type === "root" && node.children) {
    return node.children.map(nodeToHtml).join("");
  }

  const tag = node.tagName ?? "div";
  const attrs = propsToAttrs(node.properties);
  const children = node.children?.map(nodeToHtml).join("") ?? "";

  if (["br", "hr", "img", "input"].includes(tag)) {
    return `<${tag}${attrs} />`;
  }

  return `<${tag}${attrs}>${children}</${tag}>`;
}

function propsToAttrs(props?: Record<string, unknown>): string {
  if (!props) return "";
  return Object.entries(props)
    .filter(([, v]) => v != null && v !== false)
    .map(([k, v]) => {
      const attr = k === "className" ? "class" : k;
      if (v === true) return ` ${attr}`;
      return ` ${attr}="${escapeHtml(String(v))}"`;
    })
    .join("");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── <Preframe> component ───────────────────────────────────────────

export interface PreframeProps {
  /** Markdown content to render */
  content?: string;
  /** Whether content is actively streaming */
  streaming?: boolean;
  /** Plugins for code, math, etc. */
  plugins?: PreframePlugin[];
  /** Font family for pretext measurement (must match CSS) */
  font?: string;
  /** Font size in px. Default: 16 */
  fontSize?: number;
  /** Line height in px. Default: 24 */
  lineHeight?: number;
  /** Block margin in px. Default: 16 */
  blockMargin?: number;
  /** CSS class for the container */
  className?: string;
  /** Inline styles for the container */
  style?: React.CSSProperties;
  /** Children rendered after the content (e.g., streaming cursor) */
  children?: ReactNode;
}

export function Preframe({
  content,
  streaming = false,
  plugins,
  font,
  fontSize,
  lineHeight,
  blockMargin,
  className,
  style,
  children,
}: PreframeProps) {
  const { state, registry, containerRef, setContent, endStream } = usePreframe({
    plugins,
    font,
    fontSize,
    lineHeight,
    blockMargin,
  });

  const prevContentRef = useRef<string | undefined>(undefined);

  // Update content when it changes
  useEffect(() => {
    if (content === undefined || content === prevContentRef.current) return;
    prevContentRef.current = content;
    setContent(content);
  }, [content, setContent]);

  // Handle stream end
  useEffect(() => {
    if (!streaming && prevContentRef.current !== undefined) {
      endStream();
    }
  }, [streaming, endStream]);

  // Attach smart copy handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const copyHandler = createCopyHandler(registry);
    return copyHandler.attach(container);
  }, [registry, containerRef]);

  const containerStyle: React.CSSProperties = {
    position: "relative",
    overflow: "hidden",
    minHeight: state?.totalHeight ?? 0,
    ...style,
  };

  return (
    <div
      ref={containerRef}
      className={className}
      style={containerStyle}
      role="log"
      aria-live="polite"
      aria-atomic={false}
      aria-busy={streaming}
    >
      {state?.layout.map((block: LayoutBlock) => (
        <BlockRenderer
          key={block.blockId}
          block={block}
          registry={registry}
          isStreaming={streaming}
        />
      ))}
      {children}
    </div>
  );
}

// Re-export core types for convenience
export type {
  PreframePlugin,
  PreframeOptions,
  PluginComponentProps,
  PipelineState,
  PipelineMetrics,
  EnrichedNode,
  ASTNode,
  LayoutBlock,
  LayoutTree,
} from "@preframe/core";
