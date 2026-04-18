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
import { SiteNav } from "../../components/site-nav";
import { Footer } from "../../components/footer";
import { Chip, CHIP_GROUP_STYLE, CHIP_SECTION_LABEL_STYLE } from "../../components/chip";
import { useThemeKey } from "../../lib/theme-context";
import { type ThemeKey } from "../../lib/themes";

// ── Inkset column ──────────────────────────────────────────────────
import { Inkset, type InksetTheme } from "@inkset/react";
import { createCodePlugin } from "@inkset/code";
import { createMathPlugin } from "@inkset/math";
import { createTablePlugin } from "@inkset/table";
import { createDiagramPlugin } from "@inkset/diagram";

// ── Streamdown column ──────────────────────────────────────────────
import { Streamdown, type ThemeInput } from "streamdown";
import { math as streamdownMath } from "@streamdown/math";
import { mermaid as streamdownMermaid } from "@streamdown/mermaid";
import { createCodePlugin as createStreamdownCodePlugin } from "@streamdown/code";
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
- Rich async blocks are cached too: once math or highlighted code settles at a width, revisiting that width reuses the settled height instead of replaying the shift.
`,
  },
  {
    key: "stream",
    label: "stream it",
    markdown: `# Streaming response

Watch this paragraph land token-by-token. The three renderers below show the same stream at the same rate.

**react-markdown** re-parses the full tree on every token. You'll see the whole column flash as the AST rebuilds.

**streamdown** diffs at the block level — incomplete fences are gated until they close, and completed blocks freeze.

**inkset** streams into a "hot block" at the bottom. Prior blocks are absolute-positioned and don't re-measure. Drag the width slider mid-stream: text relayout stays arithmetic, and settled math/code blocks keep their previous height when you revisit a width.

\`\`\`ts
// The hot block lives in normal flow.
// Every block above it is locked into place.
function appendToken(text: string) {
  hotBlock.raw += text;
  hotBlock.hot = true;
}
\`\`\`

The difference grows with wider text, more blocks, and narrower windows — especially once rich blocks enter the stream.
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

// Per-theme-key plugin bundles — shiki / mermaid themes must match the page
// palette or the comparison column looks broken (dark-on-light or vice versa).
const INKSET_CODE_BY_THEME: Record<ThemeKey, ReturnType<typeof createCodePlugin>> = {
  dark: createCodePlugin({ theme: "github-dark" }),
  light: createCodePlugin({ theme: "github-light" }),
  sepia: createCodePlugin({ theme: "github-light" }),
  dusk: createCodePlugin({ theme: "github-dark" }),
};
const INKSET_DIAGRAM_BY_THEME: Record<ThemeKey, ReturnType<typeof createDiagramPlugin>> = {
  dark: createDiagramPlugin({ theme: "dark" }),
  light: createDiagramPlugin({ theme: "default" }),
  sepia: createDiagramPlugin({ theme: "neutral" }),
  dusk: createDiagramPlugin({ theme: "dark" }),
};
const INKSET_MATH = createMathPlugin();
const INKSET_TABLE = createTablePlugin();

// Inkset theme wired to the page's palette CSS vars so body text, code chrome
// and table borders track the selected theme automatically.
const INKSET_THEME: InksetTheme = {
  colors: {
    text: "var(--pg-text-primary)",
    textMuted: "var(--pg-text-muted)",
    blockquoteAccent: "var(--pg-border-default)",
    blockquoteText: "var(--pg-text-muted)",
    inlineCodeBg: "var(--pg-surface-raised)",
    inlineCodeText: "var(--pg-text-primary)",
    hr: "var(--pg-divider)",
  },
  code: {
    headerBorderColor: "var(--pg-border-subtle)",
  },
  table: {
    border: "var(--pg-border-subtle)",
    headerText: "var(--pg-text-muted)",
  },
};

const STREAMDOWN_CODE_BY_THEME: Record<ThemeKey, ReturnType<typeof createStreamdownCodePlugin>> = {
  dark: createStreamdownCodePlugin({ themes: ["github-dark", "github-dark"] }),
  light: createStreamdownCodePlugin({ themes: ["github-light", "github-light"] }),
  sepia: createStreamdownCodePlugin({ themes: ["github-light", "github-light"] }),
  dusk: createStreamdownCodePlugin({ themes: ["github-dark", "github-dark"] }),
};
const SHIKI_THEME_PAIR_BY_KEY = {
  dark: ["github-dark", "github-dark"],
  light: ["github-light", "github-light"],
  sepia: ["github-light", "github-light"],
  dusk: ["github-dark", "github-dark"],
} as const satisfies Record<ThemeKey, readonly [string, string]>;

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
  streamdown: "streamdown@2.5 + @streamdown/{code,math,mermaid}",
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

const ComparePage = () => {
  const { themeKey } = useThemeKey();
  const inksetPlugins = React.useMemo(
    () => [
      INKSET_CODE_BY_THEME[themeKey] ?? INKSET_CODE_BY_THEME.dark,
      INKSET_MATH,
      INKSET_TABLE,
      INKSET_DIAGRAM_BY_THEME[themeKey] ?? INKSET_DIAGRAM_BY_THEME.dark,
    ],
    [themeKey],
  );
  const streamdownPlugins = React.useMemo(
    () => ({
      code: STREAMDOWN_CODE_BY_THEME[themeKey] ?? STREAMDOWN_CODE_BY_THEME.dark,
      math: streamdownMath,
      mermaid: streamdownMermaid,
    }),
    [themeKey],
  );
  const shikiThemePair: [ThemeInput, ThemeInput] = [
    ...(SHIKI_THEME_PAIR_BY_KEY[themeKey] ?? SHIKI_THEME_PAIR_BY_KEY.dark),
  ];
  const [scenarioKey, setScenarioKey] = useState<string>("rich");
  const [streaming, setStreaming] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const [sharedWidth, setSharedWidth] = useState(480);
  // Track a mobile breakpoint so we can clamp the width slider and tighten
  // chrome. The columns stack under 900px (see GlobalStyles); we treat
  // <768px as "phone" for control-layout purposes.
  const [isNarrow, setIsNarrow] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  // On mobile the slider's 780px cap would overflow the viewport and waste
  // the right half of the track. Cap the usable range to the actual column
  // width minus gutters, and snap stored state so we never render wider
  // than the device can show.
  const effectiveMaxWidth = isNarrow
    ? Math.max(280, Math.min(780, typeof window !== "undefined" ? window.innerWidth - 32 : 780))
    : 780;
  const effectiveWidth = Math.min(sharedWidth, effectiveMaxWidth);

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
  const content =
    streaming || streamedContent.length > 0 ? streamedContent : activeScenario.markdown;

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
  const onInksetRender = React.useMemo(() => makeProfiler(inksetMetricsRef), [makeProfiler]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--pg-bg)",
        color: "var(--pg-text-primary)",
        fontFamily: "var(--font-sans), system-ui, -apple-system, sans-serif",
      }}
    >
      <SiteNav activePage="compare" />

      {/* Controls */}
      <div
        className="pg-compare-controls"
        style={{
          padding: "10px 22px",
          borderBottom: "1px solid var(--pg-border-subtle)",
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          alignItems: "center",
          fontSize: 12,
          background: "var(--pg-bg)",
          flexShrink: 0,
        }}
      >
        <div style={CHIP_GROUP_STYLE}>
          <span style={CHIP_SECTION_LABEL_STYLE}>Scenario</span>
          {SCENARIOS.map((s) => (
            <Chip
              key={s.key}
              label={s.label}
              active={scenarioKey === s.key}
              onClick={() => setScenarioKey(s.key)}
            />
          ))}
        </div>

        <div
          className="pg-compare-divider"
          style={{ width: 1, height: 16, background: "var(--pg-divider)" }}
        />

        <div style={{ ...CHIP_GROUP_STYLE, gap: 10 }}>
          <span style={CHIP_SECTION_LABEL_STYLE}>Width</span>
          <input
            type="range"
            min={280}
            max={effectiveMaxWidth}
            step={1}
            value={effectiveWidth}
            onChange={(e) => setSharedWidth(Math.round(Number(e.target.value)))}
            style={{ width: 160, maxWidth: "100%", accentColor: "var(--pg-accent)" }}
          />
          <span
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              color: "var(--pg-text-muted)",
              fontSize: 11,
              minWidth: 46,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {effectiveWidth}px
          </span>
        </div>

        <div
          className="pg-compare-divider"
          style={{ width: 1, height: 16, background: "var(--pg-divider)" }}
        />

        <div style={CHIP_GROUP_STYLE}>
          <Chip
            label={streaming ? "Stop stream" : "Start stream"}
            active={streaming}
            variant="accent"
            onClick={streaming ? onStopStream : onStartStream}
            leadingDot
          />
          <Chip label="Reset" variant="quiet" onClick={onReset} />
        </div>

        <div
          className="pg-compare-divider"
          style={{ width: 1, height: 16, background: "var(--pg-divider)" }}
        />

        <Chip
          label={recording ? "Recording metrics" : "Measure"}
          active={recording}
          variant="accent"
          onClick={onToggleRecording}
          leadingDot
          title={
            recording ? "Metrics update 4×/sec while on" : "Enable to see live render-time + count"
          }
        />
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
          label="inkset"
          bundleSize={BUNDLE_SIZES.inkset}
          bundleNote={BUNDLE_NOTES.inkset}
          metrics={inksetMetrics}
          accent
        >
          <Profiler id="inkset" onRender={onInksetRender}>
            <div style={{ width: effectiveWidth, maxWidth: "100%" }}>
              <Inkset
                content={content}
                streaming={streaming}
                plugins={inksetPlugins}
                theme={INKSET_THEME}
                width={effectiveWidth}
                fontSize={14}
                lineHeight={21}
                blockMargin={12}
                headingSizes={[1.5, 1.25, 1.1, 1]}
                headingWeights={[700, 700, 600, 600]}
                headingLineHeights={[1.2, 1.22, 1.25, 1.3]}
              />
            </div>
          </Profiler>
        </Column>

        <Column
          label="react-markdown"
          bundleSize={BUNDLE_SIZES.reactMarkdown}
          bundleNote={BUNDLE_NOTES.reactMarkdown}
          metrics={reactMarkdownMetrics}
        >
          <Profiler id="react-markdown" onRender={onReactMarkdownRender}>
            <div style={{ width: effectiveWidth, maxWidth: "100%" }}>
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
          note="requires tailwind — components ship as tailwind classes, so without it in the host app code blocks and controls render unstyled"
        >
          <Profiler id="streamdown" onRender={onStreamdownRender}>
            <div className="sd-column" style={{ width: effectiveWidth, maxWidth: "100%" }}>
              <Streamdown
                plugins={streamdownPlugins}
                mode={streaming ? "streaming" : "static"}
                shikiTheme={shikiThemePair}
                controls={false}
                animated={false}
              >
                {content}
              </Streamdown>
            </div>
          </Profiler>
        </Column>
      </div>

      <Footer />

      <GlobalStyles />
    </div>
  );
};

// ── Column wrapper ────────────────────────────────────────────────

const Column = ({
  label,
  bundleSize,
  bundleNote,
  metrics,
  accent,
  note,
  children,
}: {
  label: string;
  bundleSize: string;
  bundleNote: string;
  metrics: Metrics;
  accent?: boolean;
  note?: string;
  children: React.ReactNode;
}) => {
  return (
    <div
      className="pg-compare-column"
      style={{
        flex: 1,
        minWidth: 0,
        borderRight: "1px solid var(--pg-border-subtle)",
        display: "flex",
        flexDirection: "column",
        background: accent ? "var(--pg-accent-soft)" : "transparent",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--pg-border-subtle)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          flexShrink: 0,
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
              color: accent ? "var(--pg-accent)" : "var(--pg-text-primary)",
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--pg-text-muted)",
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
          <MetricCell label="render" value={`${metrics.lastRenderMs.toFixed(5)}ms`} />
          <MetricCell label="peak" value={`${metrics.peakRenderMs.toFixed(5)}ms`} />
          <MetricCell label="count" value={`${metrics.renderCount}`} />
        </div>
        {note ? (
          <div
            style={{
              marginTop: 4,
              fontSize: 10.5,
              lineHeight: 1.45,
              padding: "6px 8px",
              borderRadius: 6,
              background: "rgba(180, 140, 60, 0.08)",
              border: "1px solid rgba(180, 140, 60, 0.2)",
              color: "rgba(255, 210, 140, 0.85)",
            }}
          >
            {note}
          </div>
        ) : null}
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
};

const MetricCell = ({ label, value }: { label: string; value: string }) => {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
      <span style={{ opacity: 0.5 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
};

// ── Global styles for react-markdown output (dark-mode prose) ─────

const GlobalStyles = () => {
  return (
    <style jsx global>{`
      /* Minimal prose for react-markdown so the comparison isn't dominated
         by it having no stylesheet. Colors come from the page's palette
         CSS vars (set by RootChrome) so light/dark/sepia/dusk all work. */
      .rm-prose {
        color: var(--pg-text-primary);
        font-size: 14px;
        line-height: 1.55;
      }
      .rm-prose h1 {
        font-size: 1.5em;
        font-weight: 700;
        margin: 0 0 0.5em;
        letter-spacing: -0.02em;
        line-height: 1.15;
      }
      .rm-prose h2 {
        font-size: 1.25em;
        font-weight: 700;
        margin: 1em 0 0.4em;
        letter-spacing: -0.01em;
      }
      .rm-prose h3 {
        font-size: 1.1em;
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
        background: var(--pg-surface-raised);
        padding: 0.15em 0.35em;
        border-radius: 0.35em;
        font-size: 0.92em;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .rm-prose pre {
        background: var(--pg-surface-raised);
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
        border-bottom: 1px solid var(--pg-border-subtle);
        padding: 8px 10px;
        text-align: left;
      }
      .rm-prose th {
        font-size: 11px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--pg-text-muted);
      }
      .rm-prose blockquote {
        padding-left: 1em;
        border-left: 3px solid var(--pg-border-default);
        color: var(--pg-text-muted);
        margin: 0 0 0.9em;
      }
      .rm-prose hr {
        border: 0;
        border-top: 1px solid var(--pg-divider);
      }
      .rm-prose .katex-display {
        margin: 0.5em 0;
      }

      /* Streamdown ships its own styles.css but sizes everything for a
         full-width article context. Tone it down so the column reads at
         the same rhythm as the other two. We scope via .sd-column so we
         don't touch anything else on the page. */
      .sd-column {
        color: var(--pg-text-primary);
        font-size: 14px;
        line-height: 1.55;
      }
      .sd-column h1 {
        font-size: 1.5em;
        font-weight: 700;
        margin: 0 0 0.5em;
        letter-spacing: -0.02em;
        line-height: 1.15;
      }
      .sd-column h2 {
        font-size: 1.25em;
        font-weight: 700;
        margin: 1em 0 0.4em;
        letter-spacing: -0.01em;
        line-height: 1.2;
      }
      .sd-column h3 {
        font-size: 1.1em;
        font-weight: 600;
        margin: 0.9em 0 0.3em;
      }
      .sd-column p,
      .sd-column ul,
      .sd-column ol {
        margin: 0 0 0.9em;
      }
      .sd-column ul,
      .sd-column ol {
        padding-left: 1.4em;
      }
      .sd-column li {
        margin-bottom: 0.3em;
      }
      /* Deliberately not styling .sd-column pre / pre code / code blocks
         here. Streamdown ships its own block chrome (header strip with
         language label, flex-per-line structure for shiki tokens,
         post-load highlight swap). Overriding pre collapses its line
         rows and strips the header background, which turned the code
         blocks into a wall of plain text. Letting streamdown's own
         stylesheet run is the honest comparison anyway — the question
         is "what do you get out of the box", not "what if I rebuild
         their CSS". */
      .sd-column code:not(pre code) {
        background: var(--pg-surface-raised);
        padding: 0.15em 0.35em;
        border-radius: 0.35em;
        font-size: 0.92em;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .sd-column table {
        border-collapse: collapse;
        width: 100%;
        margin: 0 0 0.9em;
        font-size: 13px;
      }
      .sd-column th,
      .sd-column td {
        border-bottom: 1px solid var(--pg-border-subtle);
        padding: 8px 10px;
        text-align: left;
      }
      .sd-column th {
        font-size: 11px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--pg-text-muted);
        font-weight: 700;
      }
      .sd-column blockquote {
        padding-left: 1em;
        border-left: 3px solid var(--pg-border-default);
        color: var(--pg-text-muted);
        margin: 0 0 0.9em;
      }
      .sd-column hr {
        border: 0;
        border-top: 1px solid var(--pg-divider);
      }
      .sd-column .katex-display {
        margin: 0.5em 0;
      }

      @media (max-width: 900px) {
        .pg-compare-columns {
          flex-direction: column !important;
          overflow: auto !important;
        }
      }
      @media (max-width: 900px) {
        .pg-compare-column {
          border-right: 0 !important;
          border-bottom: 1px solid var(--pg-border-subtle);
        }
        .pg-compare-column:last-child {
          border-bottom: 0 !important;
        }
      }
      @media (max-width: 768px) {
        .pg-compare-controls {
          padding: 10px 14px !important;
          gap: 10px !important;
        }
        .pg-compare-divider {
          display: none !important;
        }
      }
    `}</style>
  );
};

export default ComparePage;
