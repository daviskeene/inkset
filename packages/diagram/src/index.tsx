// Diagram plugin: renders Mermaid code blocks as SVG via mermaid.js.
// Registers as a lang-scoped handler for `code` blocks with `lang === "mermaid"`
// so the generic code plugin still owns every other language.
declare const process: { env: { NODE_ENV?: string } };

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  extractText,
  type InksetPlugin,
  type ASTNode,
  type EnrichedNode,
  type PluginContext,
  type Dimensions,
  type PluginComponentProps,
} from "@inkset/core";

// Height estimate used before the real SVG measures itself. The layout
// engine's observed-height feedback loop corrects the layout after paint;
// getting the estimate close just reduces visible layout shift.
const DIAGRAM_HEADER_HEIGHT = 24;
const DIAGRAM_PADDING = 32;
const DIAGRAM_MIN_HEIGHT = 320;
const DIAGRAM_MAX_ESTIMATE = 900;
const COPY_FEEDBACK_DURATION_MS = 2000;

// Diagram-type-aware height estimate. Returns the expected *content* height
// (before header + padding) for a given mermaid source. The real SVG is
// measured via ResizeObserver after paint, but a close upfront estimate
// avoids the layout-shift/overlap flicker on first render.
const estimateDiagramContentHeight = (source: string): number => {
  const firstLine = source.trim().split("\n")[0].trim().toLowerCase();
  const matches = (re: RegExp) => (source.match(re) ?? []).length;

  if (firstLine.startsWith("sequencediagram")) {
    // ~25px header band per participant + ~25px per message row.
    const participants = Math.max(2, matches(/^\s*participant\s+/gm));
    const messages = matches(/--?>>?|--?x|--?\)/g);
    return 80 + participants * 25 + messages * 28;
  }
  if (
    firstLine.startsWith("statediagram") ||
    firstLine.startsWith("flowchart") ||
    firstLine.startsWith("graph")
  ) {
    // State/flow diagrams lay out in 2D — per-arrow cost is smaller than
    // the naive "one row per arrow" because mermaid fans them out
    // horizontally where possible.
    const arrows = Math.max(3, matches(/-->/g));
    return 140 + arrows * 35;
  }
  if (firstLine.startsWith("classdiagram")) {
    const classes = Math.max(2, matches(/^\s*class\s+/gm));
    return 160 + classes * 80;
  }
  if (firstLine.startsWith("erdiagram")) {
    const entities = Math.max(2, matches(/\{[^}]*\}/g));
    return 160 + entities * 100;
  }
  if (firstLine.startsWith("gantt")) {
    const tasks = matches(/^\s*[^\n]+:\s*/gm);
    return 140 + tasks * 26;
  }

  // Unrecognized type: fall back to a line-count heuristic.
  const lines = source.split("\n").filter((l) => l.trim()).length;
  return 100 + lines * 42;
};

// ── Mermaid lazy loader ───────────────────────────────────────────

// Structural subset of mermaid's exported shape — lets us call the two
// methods we need without pulling in mermaid's full types, and stays
// loose enough that both `mermaid@10` and `mermaid@11` satisfy it.
type MermaidModule = {
  default: {
    initialize: (config: Record<string, unknown>) => void;
    render: (
      id: string,
      text: string,
    ) => Promise<{ svg: string; bindFunctions?: (el: Element) => void }>;
  };
};

let mermaidPromise: Promise<MermaidModule> | null = null;
const getMermaid = (): Promise<MermaidModule> => {
  if (!mermaidPromise) {
    // `mermaid` is an optional peer dep — the import fails if the consumer
    // hasn't installed it. Log once and re-throw so callers fall through
    // to their raw-source fallback branch.
    mermaidPromise = import("mermaid").catch((err: unknown) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[inkset/diagram] `mermaid` is not installed. Run `npm install mermaid` to enable diagram rendering.",
          err,
        );
      }
      mermaidPromise = null;
      throw err;
    }) as Promise<MermaidModule>;
  }
  return mermaidPromise;
};

// Serialize render calls across the page so mermaid's global `initialize`
// state doesn't race between two components asking for different themes
// at the same time. The mermaid team has documented render() as not
// concurrency-safe.
let renderLock: Promise<unknown> = Promise.resolve();

// ── Helpers ───────────────────────────────────────────────────────

const hashStr = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h << 5) + h + s.charCodeAt(i);
  return Math.abs(h).toString(36);
};

const extractCodeContent = (node: ASTNode): string => {
  if (node.children) {
    for (const child of node.children) {
      if (child.tagName === "pre") return extractCodeContent(child);
      if (child.tagName === "code") return extractText(child);
      if (child.type === "text" && child.value) return child.value;
    }
  }
  return node.value ?? "";
};

/** Detect language from remark's `language-xxx` className on code elements. */
const detectLanguage = (node: ASTNode): string | null => {
  if (node.lang) return node.lang;
  if (node.children) {
    for (const child of node.children) {
      if (child.tagName === "pre" && child.children) {
        for (const grandchild of child.children) {
          if (grandchild.tagName === "code" && grandchild.properties?.className) {
            const classes = grandchild.properties.className;
            if (Array.isArray(classes)) {
              const langClass = classes.find(
                (c) => typeof c === "string" && c.startsWith("language-"),
              );
              if (typeof langClass === "string") return langClass.replace("language-", "");
            }
          }
        }
      }
    }
  }
  return null;
};

const isMermaidNode = (node: ASTNode): boolean => detectLanguage(node) === "mermaid";

// ── Diagram component ─────────────────────────────────────────────

const DiagramBlock = ({ node, isStreaming }: PluginComponentProps) => {
  const source = (node.pluginData?.source as string) ?? "";
  const theme = (node.pluginData?.theme as string) ?? "dark";
  const showHeader = (node.pluginData?.showHeader as boolean) ?? true;
  const showCopy = (node.pluginData?.showCopy as boolean) ?? true;

  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Retain the last successful render so a transient parse error during
  // streaming stabilization doesn't flash the raw source back onto the page.
  const lastValidSvgRef = useRef<string | null>(null);

  // Stable per-source with a random suffix for uniqueness across instances.
  // Mermaid injects a hidden <div id={id}> into document.body during render;
  // colliding IDs cause the classic "only the last diagram renders" bug.
  const id = useMemo(
    () => `inkset-m-${hashStr(source)}-${Math.random().toString(36).slice(2, 8)}`,
    [source],
  );

  useEffect(() => {
    // Don't attempt to render a partial diagram — mermaid's parser throws
    // on incomplete input and the error fallback flashes badly. Wait until
    // the block settles.
    if (isStreaming || !source) return;

    let cancelled = false;

    const run = async () => {
      const mermaid = await getMermaid().catch(() => null);
      if (cancelled || !mermaid) {
        if (!cancelled && !lastValidSvgRef.current) {
          setError("mermaid is not installed");
        }
        return;
      }

      // Serialize through the module-level lock. initialize() mutates global
      // state and concurrent render() calls are documented as unsafe.
      const job = renderLock.then(async () => {
        if (cancelled) return;
        try {
          mermaid.default.initialize({
            theme,
            startOnLoad: false,
            securityLevel: "strict",
          });
          const result = await mermaid.default.render(id, source);
          if (cancelled) return;
          lastValidSvgRef.current = result.svg;
          setSvg(result.svg);
          setError("");
        } catch (err) {
          if (cancelled) return;
          if (process.env.NODE_ENV !== "production") {
            console.debug("[inkset/diagram] mermaid render failed:", err);
          }
          // Keep the last valid render visible rather than flashing the raw
          // source. Only surface the error when there's nothing to show.
          if (!lastValidSvgRef.current) {
            setError(err instanceof Error ? err.message : "Parse error");
          }
        }
      });
      renderLock = job.catch(() => undefined);
      await job;
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [id, source, theme, isStreaming]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(source).then(() => {
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
    });
  }, [source]);

  const hasHeader = showHeader && showCopy;
  const displaySvg = svg ?? lastValidSvgRef.current;

  return (
    <div className="inkset-diagram-block" style={{ position: "relative" }}>
      {hasHeader && (
        <div className="inkset-diagram-header">
          <span className="inkset-diagram-lang">mermaid</span>
          <button
            onClick={handleCopy}
            className="inkset-diagram-copy"
            aria-label={copied ? "Copied" : "Copy source"}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}

      {displaySvg && !isStreaming ? (
        <div className="inkset-diagram-content" dangerouslySetInnerHTML={{ __html: displaySvg }} />
      ) : error && !isStreaming && !displaySvg ? (
        <div className="inkset-diagram-error">
          <div className="inkset-diagram-error-label">Diagram error: {error}</div>
          <pre className="inkset-diagram-source">{source}</pre>
        </div>
      ) : (
        <pre className="inkset-diagram-source">{source}</pre>
      )}
    </div>
  );
};

// ── Plugin definition ─────────────────────────────────────────────

export type DiagramTheme = "default" | "dark" | "neutral" | "forest" | "base";

export type DiagramPluginOptions = {
  /** Mermaid theme name. See https://mermaid.js.org/config/theming.html */
  theme?: DiagramTheme;
  /** Optional language override for detection (default: "mermaid"). */
  language?: string;
  /** Show the header bar (lang label + copy button). Default `true`. */
  showHeader?: boolean;
  /** Show the copy button in the header. Default `true`. */
  showCopy?: boolean;
};

export const createDiagramPlugin = (options?: DiagramPluginOptions): InksetPlugin => {
  const theme: DiagramTheme = options?.theme ?? "dark";
  const language = options?.language ?? "mermaid";
  const showHeader = options?.showHeader ?? true;
  const showCopy = options?.showCopy ?? true;

  return {
    name: "diagram",
    // Every option that changes rendered HTML must participate so the
    // pipeline rebuilds on swap (same pattern as code/math/table plugins).
    key: [theme, language, showHeader, showCopy].join("|"),
    handles: ["code"],

    // Lang-scoped gate: only claim code blocks whose language matches.
    // The generic code plugin keeps every other language without change.
    canHandle: (node) => detectLanguage(node) === language,

    async preload(): Promise<void> {
      // Warm the mermaid chunk during pipeline init. The fallback at
      // render time handles the missing-peer case gracefully.
      await getMermaid().catch(() => undefined);
    },

    transform(node: ASTNode, _ctx: PluginContext): EnrichedNode {
      const source = extractCodeContent(node).trim();
      return {
        ...node,
        transformedBy: "diagram",
        pluginData: { source, theme, showHeader, showCopy },
      };
    },

    measure(node: EnrichedNode, maxWidth: number): Dimensions {
      const source = (node.pluginData?.source as string) ?? "";
      const headerSpace =
        (node.pluginData?.showHeader as boolean) === false ? 0 : DIAGRAM_HEADER_HEIGHT;
      // Type-aware content estimate + chrome. The ResizeObserver feedback
      // in the React layer corrects to real SVG height after paint; this
      // estimate just aims to keep the initial paint close enough that
      // the layout shift doesn't overlap the next block.
      const estimated = estimateDiagramContentHeight(source) + headerSpace + DIAGRAM_PADDING;
      return {
        width: maxWidth,
        height: Math.max(DIAGRAM_MIN_HEIGHT, Math.min(DIAGRAM_MAX_ESTIMATE, estimated)),
      };
    },

    component: DiagramBlock,
  };
};

// Exported for tests and downstream plugins that want to share the lang
// detection logic. Not part of the stable surface; may move to core later.
export { detectLanguage, isMermaidNode };
