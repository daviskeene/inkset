"use client";

import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import Link from "next/link";
import { Inkset, type InksetTheme } from "@inkset/react";
import { createCodePlugin } from "@inkset/code";
import { createMathPlugin } from "@inkset/math";
import { createTablePlugin } from "@inkset/table";

const MARKDOWN_PANEL_WIDTH = 340;
const CHAT_MAX_WIDTH = 760;
const CHAT_SIDE_PADDING = 24;

// ── Scenarios ──────────────────────────────────────────────────────

type Scenario = {
  key: string;
  label: string;
  userPrompt: string;
  assistant: string;
};

const SCENARIO_LIST: Scenario[] = [
  {
    key: "mixed",
    label: "what's inkset",
    userPrompt: "What is Inkset and why should I use it for chat UIs?",
    assistant: `# Inkset

A renderer for model output that measures text without touching the DOM.

Most chat UIs stream markdown tokens into the page and let the browser figure out where things go. This works fine until someone resizes the window, or the response has code blocks and math, or the stream is fast enough that layout can't keep up. Then you get jitter.

The problem is that measuring text with \`getBoundingClientRect()\` forces the browser to reflow the page. Do that on every token and you're fighting the rendering engine.

> Inkset measures text once with pretext, then re-layouts with arithmetic. No DOM reads in the hot path.

## How it works

\`\`\`ts
const prepared = pretext.prepare(text, "400 15px system-ui");
const layout = pretext.layout(prepared, containerWidth, 22);

// Width changes are just math now.
// Resize 1000 blocks in under a millisecond.
\`\`\`

On resize, the cost drops to:

$$t_{resize} \\approx t_{arithmetic} + t_{paint}$$

instead of the usual:

$$t_{resize} \\approx t_{reflow} + t_{measure} + t_{patch} + t_{paint}$$

Try resizing this window to feel the difference.

## Compared to Streamdown

Streamdown turns markdown into HTML fast. Inkset is solving a different thing: keeping layout stable while content streams in and the container changes size.

| | Streamdown | Inkset |
|---------|------------------------------|----------|
| Text measurement | DOM reads | pretext (Canvas) |
| Resize | Browser reflow | Arithmetic |
| Streaming | Patch DOM per token | Measured layout, flow-based hot block |
| Plugins | Post-render | Integrated (code, math, tables) |`,
  },
  {
    key: "code",
    label: "show me code",
    userPrompt: "Show me three classic sorting algorithms in TypeScript.",
    assistant: `Sure — here are the three you'll see in every intro algorithms course, with the implementations kept readable rather than clever:

## Bubble Sort

\`\`\`typescript
function bubbleSort(arr: number[]): number[] {
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
      }
    }
  }
  return arr;
}
\`\`\`

O(n²) comparisons, O(1) extra space. Mostly useful as a teaching tool or for tiny, nearly-sorted arrays.

## Quick Sort

\`\`\`typescript
function quickSort(arr: number[]): number[] {
  if (arr.length <= 1) return arr;
  const pivot = arr[Math.floor(arr.length / 2)];
  const left = arr.filter((x) => x < pivot);
  const middle = arr.filter((x) => x === pivot);
  const right = arr.filter((x) => x > pivot);
  return [...quickSort(left), ...middle, ...quickSort(right)];
}
\`\`\`

Average O(n log n), worst-case O(n²) on already-sorted input. The allocation-heavy form above is great for clarity; production code usually partitions in place.

## Merge Sort

\`\`\`typescript
function mergeSort(arr: number[]): number[] {
  if (arr.length <= 1) return arr;
  const mid = Math.floor(arr.length / 2);
  const left = mergeSort(arr.slice(0, mid));
  const right = mergeSort(arr.slice(mid));
  return merge(left, right);
}

function merge(a: number[], b: number[]): number[] {
  const result: number[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    result.push(a[i] < b[j] ? a[i++] : b[j++]);
  }
  return [...result, ...a.slice(i), ...b.slice(j)];
}
\`\`\`

Stable, O(n log n) guaranteed, O(n) extra space. What most language standard libraries use internally for object arrays.`,
  },
  {
    key: "math",
    label: "give me math",
    userPrompt: "Walk me through the linear algebra fundamentals I'd need for ML.",
    assistant: `Here's the short tour. These four show up constantly once you start reading ML papers:

### Matrix multiplication

Given $A \\in \\mathbb{R}^{m \\times n}$ and $B \\in \\mathbb{R}^{n \\times p}$, the product $AB \\in \\mathbb{R}^{m \\times p}$ is:

$$(AB)_{ij} = \\sum_{k=1}^{n} a_{ik}\\, b_{kj}$$

Every dense layer in a neural net is this, plus a bias and a nonlinearity.

### Eigenvalues and eigenvectors

For a square $A$, any $v \\neq 0$ satisfying $Av = \\lambda v$ is an eigenvector with eigenvalue $\\lambda$. You find them by solving:

$$\\det(A - \\lambda I) = 0$$

PCA is the eigendecomposition of a covariance matrix.

### Singular Value Decomposition

Any real matrix $M \\in \\mathbb{R}^{m \\times n}$ factors as:

$$M = U \\Sigma V^{*}$$

where $U$ and $V$ are orthogonal and $\\Sigma$ is non-negative diagonal. Low-rank approximations, matrix inversions, and the intuition behind transformer attention all lean on this.

### The Fourier transform

$$\\hat f(\\xi) = \\int_{-\\infty}^{\\infty} f(x)\\, e^{-2\\pi i x \\xi}\\, dx$$

Less obviously linear-algebraic, but the discrete version is literally a matrix-vector product, and it's how convolutions get computed efficiently.`,
  },
  {
    key: "stream",
    label: "stream it",
    userPrompt: "What makes Inkset different from DOM-based renderers?",
    assistant: `Watch this reply land token-by-token — same pipeline as a real LLM stream.

The **key insight** behind Inkset is that text measurement and rendering are *separate concerns*.

Traditional renderers measure text by inserting it into the DOM and reading \`getBoundingClientRect()\`. That triggers synchronous layout reflow. Fine for a static page. Expensive on every token.

Inkset uses **pretext** to measure text via Canvas, then positions blocks with absolute coordinates. On resize, only the layout math re-runs.

\`\`\`javascript
// This is the hot path — pure arithmetic.
const layout = computeLayout(measured, { containerWidth });
// ~0.0002ms per block. 1000 blocks < 0.2ms.
\`\`\`

$$\\text{speedup} = \\frac{t_{\\text{DOM reflow}}}{t_{\\text{pretext layout}}} \\approx 300\\text{-}600\\times$$

That's the thesis. Resize the window mid-stream to see nothing jitter.`,
  },
];

const SCENARIOS = Object.fromEntries(SCENARIO_LIST.map((s) => [s.key, s]));

// ── Plugins ────────────────────────────────────────────────────────

const codePlugin = createCodePlugin({ theme: "github-dark" });
const mathPlugin = createMathPlugin();
const tablePlugin = createTablePlugin();

const ALL_PLUGINS = { code: codePlugin, math: mathPlugin, table: tablePlugin };

// ── Themes ─────────────────────────────────────────────────────────

type ThemeKey = "default" | "warm" | "highContrast" | "compact";

const THEMES: Record<ThemeKey, { label: string; theme?: InksetTheme }> = {
  default: {
    label: "default",
    // Undefined theme → fall through to the CSS-var defaults in :where().
  },
  warm: {
    label: "warm",
    theme: {
      colors: {
        text: "#f4e9d8",
        textMuted: "rgba(244, 233, 216, 0.72)",
        blockquoteAccent: "#e0975c",
        blockquoteText: "rgba(244, 233, 216, 0.82)",
        inlineCodeBg: "rgba(224, 151, 92, 0.18)",
        inlineCodeText: "#f7c893",
        hr: "rgba(224, 151, 92, 0.3)",
      },
      code: {
        background: "#1c1512",
      },
      table: {
        border: "rgba(224, 151, 92, 0.2)",
        headerText: "#e0975c",
      },
    },
  },
  highContrast: {
    label: "hi-contrast",
    theme: {
      colors: {
        text: "#ffffff",
        textMuted: "#d0d0d0",
        blockquoteAccent: "#ffffff",
        blockquoteText: "#ffffff",
        inlineCodeBg: "rgba(255, 255, 255, 0.2)",
        hr: "rgba(255, 255, 255, 0.4)",
      },
      typography: {
        headingWeights: { h1: 900, h2: 900, h3: 800, h4: 800 },
        headingTracking: { h1: "-0.02em", h2: "-0.015em", h3: "-0.01em", h4: "0" },
      },
      code: {
        background: "#000000",
      },
    },
  },
  compact: {
    label: "compact",
    theme: {
      typography: {
        fontSize: 14,
        lineHeight: 1.45,
        headingSizes: { h1: "1.8em", h2: "1.4em", h3: "1.15em", h4: "1em" },
        headingLineHeights: { h1: 1.2, h2: 1.2, h3: 1.25, h4: 1.3 },
      },
      spacing: {
        listIndent: "1.2em",
        blockquotePaddingLeft: "0.75em",
      },
      code: {
        blockPadding: "10px 12px",
        blockRadius: "8px",
        blockFontSize: "13px",
        headerPadding: "2px 10px",
      },
      table: {
        cellPadding: "6px 10px",
      },
    },
  },
};

// ── Playground page ────────────────────────────────────────────────

export default function PlaygroundPage() {
  const [activeKey, setActiveKey] = useState<string>("mixed");
  const [editedContent, setEditedContent] = useState(SCENARIOS.mixed.assistant);
  const [enabledPlugins, setEnabledPlugins] = useState({
    code: true,
    math: true,
    table: true,
  });
  const [hyphenationEnabled, setHyphenationEnabled] = useState(false);
  const [shrinkwrapMode, setShrinkwrapMode] = useState<"off" | "headings" | "on">("off");
  const [themeKey, setThemeKey] = useState<ThemeKey>("default");

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [chatAreaWidth, setChatAreaWidth] = useState(0);
  const chatAreaRef = useRef<HTMLDivElement>(null);

  const [inputValue, setInputValue] = useState("");
  const [inputHasFocus, setInputHasFocus] = useState(false);

  const plugins = Object.entries(enabledPlugins)
    .filter(([, enabled]) => enabled)
    .map(([name]) => ALL_PLUGINS[name as keyof typeof ALL_PLUGINS]);

  const activeScenario = SCENARIOS[activeKey] ?? SCENARIOS.mixed;

  const stopStreaming = useCallback(() => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const runStream = useCallback(
    (targetContent: string) => {
      stopStreaming();
      const words = targetContent.split(/(\s+)/);
      const initialChunkSize = Math.min(4, words.length);
      let idx = initialChunkSize;
      setStreamedContent(words.slice(0, initialChunkSize).join(""));
      setIsStreaming(true);

      streamIntervalRef.current = setInterval(() => {
        if (idx >= words.length) {
          if (streamIntervalRef.current) {
            clearInterval(streamIntervalRef.current);
            streamIntervalRef.current = null;
          }
          setStreamedContent(targetContent);
          setIsStreaming(false);
          return;
        }
        const chunkSize = Math.ceil(Math.random() * 3);
        const chunk = words.slice(idx, idx + chunkSize).join("");
        idx += chunkSize;
        setStreamedContent((prev) => prev + chunk);
      }, 30);
    },
    [stopStreaming],
  );

  const switchScenario = useCallback(
    (key: string) => {
      const scenario = SCENARIOS[key];
      if (!scenario) return;
      stopStreaming();
      setActiveKey(key);
      setEditedContent(scenario.assistant);
      if (key === "stream") {
        runStream(scenario.assistant);
      }
    },
    [runStream, stopStreaming],
  );

  const regenerate = useCallback(() => {
    if (activeKey === "stream") {
      runStream(activeScenario.assistant);
    } else {
      runStream(editedContent);
    }
  }, [activeKey, activeScenario.assistant, editedContent, runStream]);

  useEffect(() => {
    const container = chatAreaRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) setChatAreaWidth(width);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => stopStreaming(), [stopStreaming]);

  // The assistant message width: chat area width minus the side padding, but
  // capped to CHAT_MAX_WIDTH so long lines don't become unreadable.
  const assistantWidth = Math.max(
    0,
    Math.min(chatAreaWidth - CHAT_SIDE_PADDING * 2, CHAT_MAX_WIDTH),
  );

  const displayedAssistantContent = isStreaming ? streamedContent : editedContent;

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header
        style={{
          padding: "12px 20px",
          borderBottom: "1px solid #1a1a1a",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          background: "#0a0a0a",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: -0.2 }}>
            inkset
          </h1>
          <span style={{ fontSize: 12, opacity: 0.45 }}>playground</span>
          <Link
            href="/justification-comparison"
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
            justification →
          </Link>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ opacity: 0.4, marginRight: 4 }}>theme</span>
            {(Object.keys(THEMES) as ThemeKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setThemeKey(key)}
                style={{
                  padding: "3px 9px",
                  fontSize: 11.5,
                  border: themeKey === key ? "1px solid #3a3a3a" : "1px solid #1f1f1f",
                  borderRadius: 999,
                  background: themeKey === key ? "#181818" : "transparent",
                  color: themeKey === key ? "#ededed" : "#999",
                  cursor: "pointer",
                }}
              >
                {THEMES[key].label}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 18, background: "#222" }} />

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              opacity: hyphenationEnabled ? 1 : 0.45,
            }}
            title="Insert soft hyphens so Pretext and the browser can break long words"
          >
            <input
              type="checkbox"
              checked={hyphenationEnabled}
              onChange={() => setHyphenationEnabled((v) => !v)}
              style={{ accentColor: "#888" }}
            />
            hyphens
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              opacity: shrinkwrapMode !== "off" ? 1 : 0.45,
            }}
            title="Narrow each paragraph/heading to the width of its longest line"
          >
            <input
              type="checkbox"
              checked={shrinkwrapMode !== "off"}
              onChange={() =>
                setShrinkwrapMode((m) => (m === "off" ? "headings" : m === "headings" ? "on" : "off"))
              }
              style={{ accentColor: "#888" }}
            />
            shrinkwrap
            {shrinkwrapMode !== "off" && (
              <span style={{ opacity: 0.6, fontSize: 11 }}>({shrinkwrapMode})</span>
            )}
          </label>

          <div style={{ width: 1, height: 18, background: "#222" }} />

          {Object.entries(enabledPlugins).map(([name, enabled]) => (
            <label
              key={name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                opacity: enabled ? 1 : 0.45,
              }}
            >
              <input
                type="checkbox"
                checked={enabled}
                onChange={() =>
                  setEnabledPlugins((prev) => ({
                    ...prev,
                    [name]: !prev[name as keyof typeof prev],
                  }))
                }
                style={{ accentColor: "#888" }}
              />
              {name}
            </label>
          ))}
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* ── Left sidebar: raw markdown the assistant "replied with" ── */}
        <aside
          style={{
            width: MARKDOWN_PANEL_WIDTH,
            flexShrink: 0,
            borderRight: "1px solid #1a1a1a",
            display: "flex",
            flexDirection: "column",
            background: "#0a0a0a",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              fontSize: 11,
              letterSpacing: 0.4,
              opacity: 0.5,
              textTransform: "uppercase",
              borderBottom: "1px solid #1a1a1a",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>assistant markdown</span>
            <span style={{ opacity: 0.7 }}>edit to rerender</span>
          </div>
          <textarea
            value={isStreaming ? streamedContent : editedContent}
            onChange={(e) => {
              stopStreaming();
              setEditedContent(e.target.value);
            }}
            readOnly={isStreaming}
            spellCheck={false}
            style={{
              flex: 1,
              padding: 14,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 12.5,
              lineHeight: 1.55,
              background: "#0a0a0a",
              color: "#c8c8cc",
              border: "none",
              resize: "none",
              outline: "none",
            }}
          />
        </aside>

        {/* ── Chat area ── */}
        <main
          ref={chatAreaRef}
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            background: "#0a0a0a",
          }}
        >
          {/* Scrollable transcript */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: `28px ${CHAT_SIDE_PADDING}px 24px`,
              display: "flex",
              flexDirection: "column",
              gap: 20,
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: CHAT_MAX_WIDTH,
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}
            >
              <ScenarioStrip
                active={activeKey}
                onSelect={switchScenario}
                scenarios={SCENARIO_LIST}
                disabled={isStreaming}
              />

              <UserBubble text={activeScenario.userPrompt} />

              <AssistantMessage
                key={`${activeKey}-${isStreaming ? "streaming" : "settled"}`}
                content={displayedAssistantContent}
                streaming={isStreaming}
                plugins={plugins}
                width={assistantWidth}
                hyphenation={hyphenationEnabled}
                shrinkwrap={
                  shrinkwrapMode === "off"
                    ? false
                    : shrinkwrapMode === "headings"
                      ? "headings"
                      : true
                }
                theme={THEMES[themeKey].theme}
                onRegenerate={regenerate}
              />
            </div>
          </div>

          {/* Input */}
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            focused={inputHasFocus}
            onFocusChange={setInputHasFocus}
            plugins={plugins}
            hyphenation={hyphenationEnabled}
            theme={THEMES[themeKey].theme}
            width={Math.max(0, Math.min(chatAreaWidth - CHAT_SIDE_PADDING * 2, CHAT_MAX_WIDTH) - 2)}
          />
        </main>
      </div>
    </div>
  );
}

// ── Scenario strip ────────────────────────────────────────────────

function ScenarioStrip({
  active,
  onSelect,
  scenarios,
  disabled,
}: {
  active: string;
  onSelect: (key: string) => void;
  scenarios: Scenario[];
  disabled: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? "none" : undefined,
      }}
    >
      <span
        style={{
          fontSize: 11,
          opacity: 0.4,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          alignSelf: "center",
          marginRight: 4,
        }}
      >
        try:
      </span>
      {scenarios.map((s) => (
        <button
          key={s.key}
          onClick={() => onSelect(s.key)}
          style={{
            padding: "4px 10px",
            fontSize: 12,
            border: active === s.key ? "1px solid #3a3a3a" : "1px solid #1f1f1f",
            borderRadius: 999,
            background: active === s.key ? "#181818" : "transparent",
            color: active === s.key ? "#ededed" : "#999",
            cursor: "pointer",
          }}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ── User bubble ────────────────────────────────────────────────────

function UserBubble({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div
        style={{
          maxWidth: "80%",
          padding: "10px 14px",
          borderRadius: 18,
          background: "#1c1c1f",
          color: "#ededed",
          fontSize: 14.5,
          lineHeight: 1.5,
          boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
        }}
      >
        {text}
      </div>
    </div>
  );
}

// ── Assistant message ──────────────────────────────────────────────

type AssistantMessageProps = {
  content: string;
  streaming: boolean;
  plugins: ReturnType<typeof createCodePlugin>[];
  width: number;
  hyphenation: boolean;
  shrinkwrap: boolean | "headings" | "paragraphs";
  theme: InksetTheme | undefined;
  onRegenerate: () => void;
};

function AssistantMessage({
  content,
  streaming,
  plugins,
  width,
  hyphenation,
  shrinkwrap,
  theme,
  onRegenerate,
}: AssistantMessageProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }, [content]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        paddingTop: 4,
      }}
    >
      <div style={{ width }}>
        <Inkset
          content={content}
          streaming={streaming}
          plugins={plugins}
          width={width}
          fontSize={15}
          lineHeight={22}
          blockMargin={12}
          hyphenation={hyphenation}
          shrinkwrap={shrinkwrap}
          theme={theme}
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: 4,
          marginTop: 4,
          opacity: streaming ? 0.35 : 1,
          pointerEvents: streaming ? "none" : undefined,
          transition: "opacity 120ms",
        }}
      >
        <IconButton onClick={handleCopy} label={copied ? "Copied" : "Copy"}>
          <CopyIcon />
        </IconButton>
        <IconButton
          onClick={() => setFeedback((f) => (f === "up" ? null : "up"))}
          label="Good response"
          active={feedback === "up"}
        >
          <ThumbUpIcon />
        </IconButton>
        <IconButton
          onClick={() => setFeedback((f) => (f === "down" ? null : "down"))}
          label="Bad response"
          active={feedback === "down"}
        >
          <ThumbDownIcon />
        </IconButton>
        <IconButton onClick={onRegenerate} label="Regenerate">
          <RegenerateIcon />
        </IconButton>
      </div>
    </div>
  );
}

// ── Chat input with live Inkset preview ────────────────────────────

function ChatInput({
  value,
  onChange,
  focused,
  onFocusChange,
  plugins,
  hyphenation,
  theme,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  focused: boolean;
  onFocusChange: (v: boolean) => void;
  plugins: ReturnType<typeof createCodePlugin>[];
  hyphenation: boolean;
  theme: InksetTheme | undefined;
  width: number;
}) {
  const [justSent, setJustSent] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const showPreview = focused && value.trim().length > 0;

  // Auto-grow the textarea up to a cap so paste-of-a-long-thing expands in
  // place rather than scrolling inside a tiny box. useLayoutEffect so the
  // size is correct on the first paint, not a frame later (which reads as a
  // height jump right after refresh).
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [value]);

  const handleSend = useCallback(() => {
    if (!value.trim()) return;
    setJustSent(true);
    onChange("");
    window.setTimeout(() => setJustSent(false), 1100);
  }, [onChange, value]);

  return (
    <div
      style={{
        borderTop: "1px solid #1a1a1a",
        padding: `14px ${CHAT_SIDE_PADDING}px 20px`,
        background: "#0a0a0a",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: CHAT_MAX_WIDTH }}>
        {showPreview && (
          <div
            style={{
              marginBottom: 10,
              padding: "10px 14px",
              border: "1px solid #1f1f1f",
              borderRadius: 12,
              background: "#0c0c0c",
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                opacity: 0.35,
                marginBottom: 6,
              }}
            >
              preview · rendered by inkset
            </div>
            <Inkset
              content={value}
              plugins={plugins}
              width={Math.max(0, width - 28)}
              fontSize={14}
              lineHeight={20}
              blockMargin={8}
              hyphenation={hyphenation}
              theme={theme}
            />
          </div>
        )}

        <div
          style={{
            display: "flex",
            // Center for the single-line default so the placeholder sits in
            // the middle of the pill. Multi-line content grows the textarea
            // downward while the send button hugs the bottom-right via
            // alignSelf below.
            alignItems: "center",
            gap: 10,
            padding: "8px 10px 8px 16px",
            border: focused ? "1px solid #333" : "1px solid #1f1f1f",
            borderRadius: 22,
            background: "#101010",
            transition: "border-color 120ms",
          }}
        >
          <textarea
            ref={textareaRef}
            value={value}
            placeholder={justSent ? "Sent — this is a demo, no model is wired up." : "Ask anything…"}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => onFocusChange(true)}
            onBlur={() => onFocusChange(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            spellCheck={false}
            style={{
              flex: 1,
              resize: "none",
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#ededed",
              fontSize: 14.5,
              lineHeight: 1.45,
              fontFamily: "inherit",
              // border-box so assigning scrollHeight back to `height` converges
              // immediately instead of growing by the padding amount each run.
              boxSizing: "border-box",
              padding: 0,
              maxHeight: 180,
              overflowY: "auto",
            }}
          />

          <button
            onClick={handleSend}
            disabled={!value.trim()}
            aria-label="Send"
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              border: "none",
              flexShrink: 0,
              alignSelf: "flex-end",
              background: value.trim() ? "#ededed" : "#1f1f1f",
              color: value.trim() ? "#0a0a0a" : "#5a5a5a",
              cursor: value.trim() ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 120ms, color 120ms",
            }}
          >
            <SendIcon />
          </button>
        </div>

        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            opacity: 0.35,
            textAlign: "center",
          }}
        >
          Type markdown to see the live preview. This demo doesn't call a model — pick a preset above to see a response.
        </div>
      </div>
    </div>
  );
}

// ── Small icon primitives ──────────────────────────────────────────

function IconButton({
  onClick,
  label,
  active,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        border: "none",
        background: active ? "#202023" : "transparent",
        color: active ? "#ededed" : "#7a7a82",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 120ms, color 120ms",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.color = "#ededed";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = "#7a7a82";
      }}
    >
      {children}
    </button>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function ThumbUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 011.92 2.56l-2.33 8A2 2 0 0117.5 22H7V10l4-7a2 2 0 012 1.46z" />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 01-1.92-2.56l2.33-8A2 2 0 016.5 2H17v12l-4 7a2 2 0 01-2-1.46z" />
    </svg>
  );
}

function RegenerateIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}
