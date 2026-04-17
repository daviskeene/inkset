"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useLayoutEffect,
  Profiler,
  type ProfilerOnRenderCallback,
} from "react";
import Link from "next/link";

// ── Inkset column ──────────────────────────────────────────────────
import { Inkset } from "@inkset/react";
import { createCodePlugin } from "@inkset/code";
import { createMathPlugin } from "@inkset/math";
import { createTablePlugin } from "@inkset/table";
import { createDiagramPlugin } from "@inkset/diagram";

// ── Streamdown column ──────────────────────────────────────────────
import { Streamdown } from "streamdown";
import { math as streamdownMath } from "@streamdown/math";
import { mermaid as streamdownMermaid } from "@streamdown/mermaid";
import "streamdown/styles.css";

// ── React-markdown column ──────────────────────────────────────────
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";

// ── Scenarios ──────────────────────────────────────────────────────

type Scenario = {
  key: string;
  label: string;
  markdown: string;
};

const SCENARIOS: Scenario[] = [
  {
    key: "rich",
    label: "rich mix",
    markdown: `# Why streaming markdown needs a renderer

Rendering markdown in an AI chat UI looks simple until you hit code blocks, math, and a user resizing their window mid-stream.

## The cost of reflow

Every \`getBoundingClientRect()\` call while tokens arrive forces a synchronous layout pass.

\`\`\`ts
// Naive approach — reflow per token
element.textContent = nextChunk;
const height = element.getBoundingClientRect().height;
\`\`\`

## What each renderer does

| Renderer | Streaming | Plugins | Reflow cost |
|----------|-----------|---------|-------------|
| react-markdown | Re-parses per token | Wire yourself | Full DOM reflow |
| streamdown | Incremental blocks | Built-in | Reflow per block |
| inkset | Measured arithmetic | Built-in | O(1) arithmetic |

The cost drops from:

$$t_{resize} \\approx t_{reflow} + t_{measure} + t_{patch} + t_{paint}$$

to:

$$t_{resize} \\approx t_{arithmetic} + t_{paint}$$

- One caveat: the cheap path requires a measurement cache hit.
- On cache miss (font or content change) it's a normal measure pass.
- Container resize is a cache hit.
`,
  },
  {
    key: "stream",
    label: "stream it",
    markdown: `# Streaming response

Watch this paragraph land token-by-token. The three renderers below show the same stream at the same rate.

**react-markdown** re-parses the full tree on every token. You'll see the whole column flash as the AST rebuilds.

**streamdown** diffs at the block level — incomplete fences are gated until they close, and completed blocks freeze.

**inkset** streams into a "hot block" at the bottom. Prior blocks are absolute-positioned and don't re-measure. Drag the width slider mid-stream.

\`\`\`ts
// The hot block lives in normal flow.
// Every block above it is locked into place.
function appendToken(text: string) {
  hotBlock.raw += text;
  hotBlock.hot = true;
}
\`\`\`

The difference grows with wider text, more blocks, and narrower windows.
`,
  },
  {
    key: "diagram",
    label: "diagram",
    markdown: `# Diagrams

\`\`\`mermaid
sequenceDiagram
  participant U as User
  participant C as Chat UI
  participant M as Model
  U->>C: prompt
  C->>M: POST /messages
  M-->>C: token stream
  C-->>U: render tokens
\`\`\`

Each renderer handles mermaid differently:

- **react-markdown** with default plugins shows the raw source as a highlighted code block.
- **streamdown** with \`@streamdown/mermaid\` renders the fence as an SVG.
- **inkset** with \`@inkset/diagram\` dynamic-imports mermaid on first fence and swaps in the SVG once the block closes.

The tradeoff: mermaid adds ~650 KB gzipped. You should pay that weight only when a diagram actually appears.
`,
  },
];

// ── Plugins, instantiated once ─────────────────────────────────────

const INKSET_CODE = createCodePlugin({ theme: "github-dark" });
const INKSET_MATH = createMathPlugin();
const INKSET_TABLE = createTablePlugin();
const INKSET_DIAGRAM = createDiagramPlugin({ theme: "dark" });
const INKSET_PLUGINS = [INKSET_CODE, INKSET_MATH, INKSET_TABLE, INKSET_DIAGRAM];

const STREAMDOWN_PLUGINS = {
  math: streamdownMath,
  mermaid: streamdownMermaid,
};

// Approximate gzipped bundle sizes for the metrics strip. Measured at
// the pinned versions below; not exact but good enough to tell the story.
// Individual plugin chunks (shiki, katex, mermaid) are loaded on demand
// by each library so peak network cost during a real session is higher.
const BUNDLE_SIZES = {
  streamdown: "~180 KB",
  reactMarkdown: "~150 KB",
  inkset: "~55 KB",
};
const BUNDLE_NOTES = {
  streamdown: "streamdown@2.5 + @streamdown/math + mermaid",
  reactMarkdown: "react-markdown@10 + gfm + math + katex + highlight",
  inkset: "@inkset/{core,react,code,math,table,diagram}",
};

// ── Page ───────────────────────────────────────────────────────────

type Metrics = {
  lastRenderMs: number;
  peakRenderMs: number;
  renderCount: number;
};

const INITIAL_METRICS: Metrics = {
  lastRenderMs: 0,
  peakRenderMs: 0,
  renderCount: 0,
};

export default function ComparePage() {
  const [scenarioKey, setScenarioKey] = useState<string>("rich");
  const [streaming, setStreaming] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const [sharedWidth, setSharedWidth] = useState(480);

  // Metrics live in refs + are flushed on a timer only when the user
  // explicitly turns recording on. Without this gate, the flush interval
  // would drive a 4Hz render loop on an otherwise-idle page. Profiler
  // callbacks always write into the refs though, so turning recording on
  // mid-stream picks up the latest numbers immediately.
  const streamdownMetricsRef = useRef<Metrics>({ ...INITIAL_METRICS });
  const reactMarkdownMetricsRef = useRef<Metrics>({ ...INITIAL_METRICS });
  const inksetMetricsRef = useRef<Metrics>({ ...INITIAL_METRICS });
  const [metricsTick, setMetricsTick] = useState(0);
  const [recording, setRecording] = useState(false);

  const streamdownMetrics = streamdownMetricsRef.current;
  const reactMarkdownMetrics = reactMarkdownMetricsRef.current;
  const inksetMetrics = inksetMetricsRef.current;
  void metricsTick; // consumed: tick forces a re-read of refs above

  const activeScenario = SCENARIOS.find((s) => s.key === scenarioKey) ?? SCENARIOS[0];
  const content = streaming || streamedContent.length > 0
    ? streamedContent
    : activeScenario.markdown;

  // Flush metrics only while recording. 4Hz feels live without storming
  // renders on an idle page.
  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      setMetricsTick((t) => t + 1);
    }, 250);
    return () => window.clearInterval(id);
  }, [recording]);

  // Reset metrics + streamed buffer when scenario changes.
  useEffect(() => {
    setStreamedContent("");
    setStreaming(false);
    streamdownMetricsRef.current = { ...INITIAL_METRICS };
    reactMarkdownMetricsRef.current = { ...INITIAL_METRICS };
    inksetMetricsRef.current = { ...INITIAL_METRICS };
    setMetricsTick((t) => t + 1);
  }, [scenarioKey]);

  const onToggleRecording = useCallback(() => {
    setRecording((prev) => {
      if (!prev) {
        // Starting fresh — wipe old counts so the new session is legible.
        streamdownMetricsRef.current = { ...INITIAL_METRICS };
        reactMarkdownMetricsRef.current = { ...INITIAL_METRICS };
        inksetMetricsRef.current = { ...INITIAL_METRICS };
      }
      return !prev;
    });
  }, []);

  // Single scheduler for all three columns so the rendering is lockstep.
  // Emits ~12 chars per 35ms tick — roughly 340 chars/sec, close to real
  // LLM output speed.
  useEffect(() => {
    if (!streaming) return;
    const target = activeScenario.markdown;
    let index = 0;
    setStreamedContent("");
    const id = window.setInterval(() => {
      index = Math.min(index + 12, target.length);
      setStreamedContent(target.slice(0, index));
      if (index >= target.length) {
        window.clearInterval(id);
        setStreaming(false);
      }
    }, 35);
    return () => window.clearInterval(id);
  }, [streaming, activeScenario]);

  const onStartStream = useCallback(() => {
    setStreamedContent("");
    setStreaming(true);
  }, []);

  const onStopStream = useCallback(() => {
    setStreaming(false);
  }, []);

  const onReset = useCallback(() => {
    setStreamedContent("");
    setStreaming(false);
  }, []);

  // Profiler callbacks write into refs only — no setState, so re-renders
  // aren't triggered from inside the render phase.
  const makeProfiler = useCallback(
    (ref: React.MutableRefObject<Metrics>): ProfilerOnRenderCallback =>
      (_id, _phase, actualDuration) => {
        const m = ref.current;
        m.lastRenderMs = actualDuration;
        m.peakRenderMs = Math.max(m.peakRenderMs, actualDuration);
        m.renderCount += 1;
      },
    [],
  );

  const onStreamdownRender = React.useMemo(
    () => makeProfiler(streamdownMetricsRef),
    [makeProfiler],
  );
  const onReactMarkdownRender = React.useMemo(
    () => makeProfiler(reactMarkdownMetricsRef),
    [makeProfiler],
  );
  const onInksetRender = React.useMemo(
    () => makeProfiler(inksetMetricsRef),
    [makeProfiler],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#ededed",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: "12px 20px",
          borderBottom: "1px solid #1a1a1a",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: -0.2 }}>
            inkset
          </h1>
          <span style={{ fontSize: 12, opacity: 0.45, textTransform: "uppercase", letterSpacing: 0.4 }}>
            compare
          </span>
          <Link
            href="/"
            style={{
              fontSize: 11.5,
              color: "#8b8fa6",
              textDecoration: "none",
              padding: "3px 9px",
              border: "1px solid #242424",
              borderRadius: 999,
              marginLeft: 4,
            }}
          >
            ← playground
          </Link>
        </div>

        <div
          style={{
            fontSize: 12,
            opacity: 0.55,
            maxWidth: 520,
            textAlign: "right",
          }}
        >
          Three renderers, same markdown, same width, same stream rate. Drag the slider
          mid-stream to feel the reflow cost difference.
        </div>
      </header>

      {/* Controls */}
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid #1a1a1a",
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          alignItems: "center",
          fontSize: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ opacity: 0.4, marginRight: 4, textTransform: "uppercase", letterSpacing: 0.3 }}>
            scenario
          </span>
          {SCENARIOS.map((s) => (
            <button
              key={s.key}
              onClick={() => setScenarioKey(s.key)}
              style={{
                padding: "4px 11px",
                fontSize: 12,
                border:
                  scenarioKey === s.key ? "1px solid #3a3a3a" : "1px solid #1f1f1f",
                borderRadius: 999,
                background: scenarioKey === s.key ? "#181818" : "transparent",
                color: scenarioKey === s.key ? "#ededed" : "#999",
                cursor: "pointer",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 18, background: "#222" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ opacity: 0.4, textTransform: "uppercase", letterSpacing: 0.3 }}>
            width
          </span>
          <input
            type="range"
            min={280}
            max={780}
            step={1}
            value={sharedWidth}
            onChange={(e) => setSharedWidth(Math.round(Number(e.target.value)))}
            style={{ width: 180 }}
          />
          <span
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              opacity: 0.7,
              fontSize: 11,
              minWidth: 48,
            }}
          >
            {sharedWidth}px
          </span>
        </div>

        <div style={{ width: 1, height: 18, background: "#222" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {streaming ? (
            <button
              onClick={onStopStream}
              style={{
                padding: "4px 11px",
                fontSize: 12,
                border: "1px solid #3a3a3a",
                borderRadius: 999,
                background: "#181818",
                color: "#ededed",
                cursor: "pointer",
              }}
            >
              ■ stop stream
            </button>
          ) : (
            <button
              onClick={onStartStream}
              style={{
                padding: "4px 11px",
                fontSize: 12,
                border: "1px solid #1f1f1f",
                borderRadius: 999,
                background: "transparent",
                color: "#ededed",
                cursor: "pointer",
              }}
            >
              ▶ start stream
            </button>
          )}
          <button
            onClick={onReset}
            style={{
              padding: "4px 11px",
              fontSize: 12,
              border: "1px solid #1f1f1f",
              borderRadius: 999,
              background: "transparent",
              color: "#999",
              cursor: "pointer",
            }}
          >
            reset
          </button>
        </div>

        <div style={{ width: 1, height: 18, background: "#222" }} />

        <button
          onClick={onToggleRecording}
          title={
            recording
              ? "Metrics update 4×/sec while on"
              : "Enable to see live render-time + count"
          }
          style={{
            padding: "4px 11px",
            fontSize: 12,
            border: recording ? "1px solid #a55" : "1px solid #1f1f1f",
            borderRadius: 999,
            background: recording ? "rgba(180, 80, 80, 0.15)" : "transparent",
            color: recording ? "#ffb3b3" : "#999",
            cursor: "pointer",
          }}
        >
          {recording ? "● recording metrics" : "○ measure"}
        </button>
      </div>

      {/* Three columns */}
      <div
        className="pg-compare-columns"
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <Column
          label="react-markdown"
          bundleSize={BUNDLE_SIZES.reactMarkdown}
          bundleNote={BUNDLE_NOTES.reactMarkdown}
          metrics={reactMarkdownMetrics}
        >
          <Profiler id="react-markdown" onRender={onReactMarkdownRender}>
            <div style={{ width: sharedWidth, maxWidth: "100%" }}>
              <div className="rm-prose">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex, rehypeHighlight]}
                >
                  {content}
                </ReactMarkdown>
              </div>
            </div>
          </Profiler>
        </Column>

        <Column
          label="streamdown"
          bundleSize={BUNDLE_SIZES.streamdown}
          bundleNote={BUNDLE_NOTES.streamdown}
          metrics={streamdownMetrics}
        >
          <Profiler id="streamdown" onRender={onStreamdownRender}>
            <div style={{ width: sharedWidth, maxWidth: "100%" }}>
              <Streamdown
                plugins={STREAMDOWN_PLUGINS}
                mode={streaming ? "streaming" : "static"}
                shikiTheme={["github-dark", "github-dark"]}
              >
                {content}
              </Streamdown>
            </div>
          </Profiler>
        </Column>

        <Column
          label="inkset"
          bundleSize={BUNDLE_SIZES.inkset}
          bundleNote={BUNDLE_NOTES.inkset}
          metrics={inksetMetrics}
          accent
        >
          <Profiler id="inkset" onRender={onInksetRender}>
            <div style={{ width: sharedWidth, maxWidth: "100%" }}>
              <Inkset
                content={content}
                streaming={streaming}
                plugins={INKSET_PLUGINS}
                width={sharedWidth}
                fontSize={14}
                lineHeight={21}
                blockMargin={12}
              />
            </div>
          </Profiler>
        </Column>
      </div>

      <GlobalStyles />
    </div>
  );
}

// ── Column wrapper ────────────────────────────────────────────────

function Column({
  label,
  bundleSize,
  bundleNote,
  metrics,
  accent,
  children,
}: {
  label: string;
  bundleSize: string;
  bundleNote: string;
  metrics: Metrics;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        borderRight: "1px solid #1a1a1a",
        display: "flex",
        flexDirection: "column",
        background: accent ? "#0c0c10" : "transparent",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #1a1a1a",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          flexShrink: 0,
          background: accent ? "rgba(80, 120, 200, 0.04)" : "transparent",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 13,
              fontWeight: 600,
              color: accent ? "#a8c3ff" : "#ededed",
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#8b8fa6",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            {bundleSize}
          </div>
        </div>
        <div style={{ fontSize: 10.5, opacity: 0.4 }}>{bundleNote}</div>
        <div
          style={{
            display: "flex",
            gap: 12,
            fontSize: 11,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            opacity: 0.7,
          }}
        >
          <MetricCell label="render" value={`${metrics.lastRenderMs.toFixed(2)}ms`} />
          <MetricCell label="peak" value={`${metrics.peakRenderMs.toFixed(2)}ms`} />
          <MetricCell label="count" value={`${metrics.renderCount}`} />
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: "20px 16px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
      <span style={{ opacity: 0.5 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

// ── Global styles for react-markdown output (dark-mode prose) ─────

function GlobalStyles() {
  return (
    <style jsx global>{`
      /* Minimal dark-prose for react-markdown so the comparison isn't
         dominated by it having no stylesheet. Matches inkset's visual
         rhythm approximately without copying every knob. */
      .rm-prose {
        color: #ededed;
        font-size: 14px;
        line-height: 1.55;
      }
      .rm-prose h1 {
        font-size: 2em;
        font-weight: 700;
        margin: 0 0 0.5em;
        letter-spacing: -0.02em;
      }
      .rm-prose h2 {
        font-size: 1.45em;
        font-weight: 700;
        margin: 1em 0 0.4em;
        letter-spacing: -0.01em;
      }
      .rm-prose h3 {
        font-size: 1.15em;
        font-weight: 600;
        margin: 0.9em 0 0.3em;
      }
      .rm-prose p,
      .rm-prose ul,
      .rm-prose ol {
        margin: 0 0 0.9em;
      }
      .rm-prose ul,
      .rm-prose ol {
        padding-left: 1.4em;
      }
      .rm-prose li {
        margin-bottom: 0.3em;
      }
      .rm-prose code:not(pre code) {
        background: rgba(255, 255, 255, 0.08);
        padding: 0.15em 0.35em;
        border-radius: 0.35em;
        font-size: 0.92em;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .rm-prose pre {
        background: #24292e;
        border-radius: 10px;
        padding: 12px 14px;
        overflow-x: auto;
        font-size: 13px;
        line-height: 1.5;
        margin: 0 0 0.9em;
      }
      .rm-prose pre code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .rm-prose table {
        border-collapse: collapse;
        width: 100%;
        margin: 0 0 0.9em;
        font-size: 13px;
      }
      .rm-prose th,
      .rm-prose td {
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        padding: 8px 10px;
        text-align: left;
      }
      .rm-prose th {
        font-size: 11px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: rgba(232, 232, 235, 0.72);
      }
      .rm-prose blockquote {
        padding-left: 1em;
        border-left: 3px solid rgba(255, 255, 255, 0.18);
        color: rgba(232, 232, 235, 0.78);
        margin: 0 0 0.9em;
      }
      .rm-prose hr {
        border: 0;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }
      .rm-prose .katex-display {
        margin: 0.5em 0;
      }

      /* Streamdown ships its own base styles; override to match dark page */
      .streamdown {
        color: #ededed;
        font-size: 14px;
      }

      @media (max-width: 900px) {
        .pg-compare-columns {
          flex-direction: column !important;
          overflow: auto !important;
        }
      }
    `}</style>
  );
}
