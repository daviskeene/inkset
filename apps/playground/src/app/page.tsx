"use client";

import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import Link from "next/link";
import { Inkset, type InksetTheme } from "@inkset/react";
import type { InksetPlugin } from "@inkset/core";
import { createCodePlugin } from "@inkset/code";
import { createMathPlugin } from "@inkset/math";
import { createTablePlugin } from "@inkset/table";
import { createDiagramPlugin } from "@inkset/diagram";
import { reading, mono } from "./fonts";

const MARKDOWN_PANEL_WIDTH = 340;
const CHAT_MAX_WIDTH = 760;
const CHAT_SIDE_PADDING = 24;

// Reading-column font family as a literal stack (must match CSS so pretext
// measures with the same face the browser paints).
const READING_FONT_FAMILY = `${reading.style.fontFamily}, "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif`;
const READING_MONO_FAMILY = `${mono.style.fontFamily}, ui-monospace, SFMono-Regular, Menlo, monospace`;

// ── Typography scale (1.2 ratio, base 13) ──────────────────────────
// 11 · 13 · 15 · 18
// Controls/buttons use 13. Body/input/bubble use 15. Brand uses 18.
//
// Small-caps labels render at 13 because small-caps glyphs only reach ~70%
// of cap-height, so a 13px label reads closer to 9px visually — still
// smaller than the 13px regular-case controls beside it, so hierarchy
// holds without the labels becoming unreadable.
const SMALL_CAPS_LABEL = {
  fontSize: 13,
  letterSpacing: "0.03em",
  fontVariantCaps: "all-small-caps" as const,
  fontFeatureSettings: '"c2sc", "smcp"',
};

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
    label: "why inkset",
    userPrompt: "What's the best way to render AI chat output in React?",
    assistant: `# Tl;dr — Why Inkset

If you've worked on AI chat interfaces in React, you've probably run into the same thing I have: there isn't one clear standard for rendering model output. There are a few competing approaches, and they all get awkward once you care about streaming, code blocks, math, diagrams, and responsive layout at the same time.

Some tools are great at basic markdown. Some are flexible, but only after wiring together half a rendering stack yourself. Some feel fine until the window resizes mid-stream and the whole interface starts reflowing. Inkset comes from running into those issues repeatedly and wanting a cleaner foundation.

## Why pretext matters

Inkset leans on **pretext** for text measurement and layout. That gives us a useful split: measure once, then re-layout with arithmetic instead of repeated DOM reads.

\`\`\`ts
const prepared = pretext.prepare(text, "400 15px system-ui");
const layout = pretext.layout(prepared, containerWidth, 22);
\`\`\`

That unlocks real performance wins for streaming UIs, where content is arriving continuously and the layout still needs to feel stable. It also creates a solid base for composable plugins, so code, math, tables, and diagrams can participate in the same rendering pipeline instead of feeling bolted on.

## What Inkset is trying to be

I want Inkset to be the best way to display AI-generated output in React. Not just markdown, but the full shape of a response: text, code, diagrams, math, whatever the model produces.

Speed is a big part of that, but it isn't the whole job. If the output jitters, falls apart on resize, or looks like a pile of plugins taped together, it doesn't matter how fast the renderer is.

Use the controls above to switch themes, toggle shrinkwrap, and resize the layout mid-stream. That's the standard Inkset is chasing: output that stays readable, stable, and polished when it's actually dropped into a real product.`,
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
    key: "diagram",
    label: "draw me a diagram",
    userPrompt: "Sketch the lifecycle of a streaming chat request from user input through response.",
    assistant: `Sure — here's the round-trip for a typical chat completion, from keystroke to rendered response:

\`\`\`mermaid
sequenceDiagram
  participant U as User
  participant C as Chat UI
  participant A as API
  participant M as Model
  U->>C: types prompt
  C->>A: POST /messages (stream: true)
  A->>M: forward prompt
  M-->>A: token stream
  A-->>C: SSE chunks
  C-->>U: render as tokens arrive
  M->>A: [DONE]
  A->>C: close stream
  C->>U: finalize block
\`\`\`

The UI renders each chunk the moment it arrives. Inkset measures the block once via pretext, then lays out with arithmetic, so the mid-stream reflow cost stays near zero.

And here's a rougher state view of what the UI is actually tracking per message:

\`\`\`mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Streaming: user submits
  Streaming --> Streaming: token arrives
  Streaming --> Settled: stream closes
  Streaming --> Error: network/parse failure
  Error --> Idle: retry
  Settled --> Idle: new turn
\`\`\`

Every \` \`\`\`mermaid \` fence gets promoted to a real SVG diagram. The mermaid library is dynamic-imported on the first diagram seen, so your base bundle stays lean if your app never emits one.`,
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

// Per-theme-key shiki theme so the syntax highlighter inverts alongside
// the rest of the page. Cached once at module load to match the plugin
// contract (same identity between renders while the key is unchanged).
const CODE_PLUGINS_BY_THEME: Record<string, ReturnType<typeof createCodePlugin>> = {
  default: createCodePlugin({ theme: "github-dark" }),
  light: createCodePlugin({ theme: "github-light" }),
  highContrast: createCodePlugin({ theme: "github-dark" }),
  compact: createCodePlugin({ theme: "github-dark" }),
};
// Mermaid's own theme names — "dark"/"neutral" for dark page, "default"/"neutral"
// for light. Re-instantiated per theme key so the plugin `key` changes and
// the pipeline re-renders existing diagrams on theme switch.
const DIAGRAM_PLUGINS_BY_THEME: Record<string, ReturnType<typeof createDiagramPlugin>> = {
  default: createDiagramPlugin({ theme: "dark" }),
  light: createDiagramPlugin({ theme: "default" }),
  highContrast: createDiagramPlugin({ theme: "dark" }),
  compact: createDiagramPlugin({ theme: "dark" }),
};
const mathPlugin = createMathPlugin();
const tablePlugin = createTablePlugin();

// ── Themes ─────────────────────────────────────────────────────────

type ThemeKey = "default" | "light" | "highContrast" | "compact";

// Page chrome palette. `default` keeps the current dark look; `light` flips
// the whole page (header, sidebar, chat bg, borders, text) in addition to
// the Inkset content theme. Other themes inherit the dark palette — they
// only affect the rendered markdown, not the surrounding UI.
type PagePalette = {
  bg: string;
  surface: string;
  surfaceRaised: string;
  borderSubtle: string;
  borderDefault: string;
  borderStrong: string;
  textPrimary: string;
  textMuted: string;
  textFaint: string;
  divider: string;
  chipActiveBg: string;
  chipActiveText: string;
  userBubbleBg: string;
  userBubbleText: string;
  submitBg: string;
  submitText: string;
  submitDisabledBg: string;
  submitDisabledText: string;
  sidebarCodeText: string;
};

const DARK_PALETTE: PagePalette = {
  bg: "#0a0a0a",
  surface: "#101010",
  surfaceRaised: "#181818",
  borderSubtle: "#1a1a1a",
  borderDefault: "#1f1f1f",
  borderStrong: "#333",
  textPrimary: "#ededed",
  textMuted: "#8b8fa6",
  textFaint: "#5a5a5a",
  divider: "#222",
  chipActiveBg: "#181818",
  chipActiveText: "#ededed",
  userBubbleBg: "#1c1c1f",
  userBubbleText: "#ededed",
  submitBg: "#ededed",
  submitText: "#0a0a0a",
  submitDisabledBg: "#1f1f1f",
  submitDisabledText: "#5a5a5a",
  sidebarCodeText: "#c8c8cc",
};

const LIGHT_PALETTE: PagePalette = {
  bg: "#fafaf9",
  surface: "#ffffff",
  surfaceRaised: "#f2f2f0",
  borderSubtle: "#ececea",
  borderDefault: "#dddcd8",
  borderStrong: "#b5b4af",
  textPrimary: "#1a1a1a",
  textMuted: "#6a6a6a",
  textFaint: "#a8a8a6",
  divider: "#e4e4e2",
  chipActiveBg: "#ffffff",
  chipActiveText: "#1a1a1a",
  userBubbleBg: "#ebeae7",
  userBubbleText: "#1a1a1a",
  submitBg: "#1a1a1a",
  submitText: "#fafaf9",
  submitDisabledBg: "#e4e4e2",
  submitDisabledText: "#b0b0ae",
  sidebarCodeText: "#2a2a2a",
};

const paletteToCssVars = (p: PagePalette): Record<string, string> => ({
  "--pg-bg": p.bg,
  "--pg-surface": p.surface,
  "--pg-surface-raised": p.surfaceRaised,
  "--pg-border-subtle": p.borderSubtle,
  "--pg-border-default": p.borderDefault,
  "--pg-border-strong": p.borderStrong,
  "--pg-text-primary": p.textPrimary,
  "--pg-text-muted": p.textMuted,
  "--pg-text-faint": p.textFaint,
  "--pg-divider": p.divider,
  "--pg-chip-active-bg": p.chipActiveBg,
  "--pg-chip-active-text": p.chipActiveText,
  "--pg-user-bubble-bg": p.userBubbleBg,
  "--pg-user-bubble-text": p.userBubbleText,
  "--pg-submit-bg": p.submitBg,
  "--pg-submit-text": p.submitText,
  "--pg-submit-disabled-bg": p.submitDisabledBg,
  "--pg-submit-disabled-text": p.submitDisabledText,
  "--pg-sidebar-code-text": p.sidebarCodeText,
});

// Shared typography defaults applied to every theme so the rendered column
// always reads as a book: serif for body, editorial mono for inline code.
// Libre Franklin's Black/Extra-Bold cuts have tight side-bearings already,
// so we soften the Inkset default heading tracking (-0.04em on h1) to keep
// adjacent glyphs from colliding at large sizes.
const BASE_TYPOGRAPHY = {
  fontFamily: READING_FONT_FAMILY,
  fontFamilyMono: READING_MONO_FAMILY,
  headingTracking: {
    h1: "-0.01em",
    h2: "-0.005em",
    h3: "0",
    h4: "0",
  },
};

const THEMES: Record<ThemeKey, { label: string; theme: InksetTheme; palette: PagePalette }> = {
  default: {
    label: "default",
    palette: DARK_PALETTE,
    theme: {
      typography: { ...BASE_TYPOGRAPHY },
    },
  },
  light: {
    label: "light",
    palette: LIGHT_PALETTE,
    theme: {
      colors: {
        text: "#1a1a1a",
        textMuted: "rgba(26, 26, 26, 0.7)",
        blockquoteAccent: "#c8c8c6",
        blockquoteText: "rgba(26, 26, 26, 0.78)",
        inlineCodeBg: "rgba(0, 0, 0, 0.06)",
        inlineCodeText: "#1a1a1a",
        hr: "rgba(0, 0, 0, 0.1)",
      },
      typography: { ...BASE_TYPOGRAPHY },
      code: {
        background: "#f6f8fa",
        headerBorderColor: "rgba(0, 0, 0, 0.08)",
      },
      table: {
        border: "rgba(0, 0, 0, 0.08)",
        headerText: "rgba(26, 26, 26, 0.7)",
      },
    },
  },
  highContrast: {
    label: "hi-contrast",
    palette: DARK_PALETTE,
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
        ...BASE_TYPOGRAPHY,
        headingWeights: { h1: 900, h2: 900, h3: 800, h4: 800 },
        // 900-weight Libre Franklin needs even more breathing room than the
        // base 800-weight defaults above.
        headingTracking: { h1: "0", h2: "0", h3: "0", h4: "0" },
      },
      code: {
        background: "#000000",
      },
    },
  },
  compact: {
    label: "compact",
    palette: DARK_PALETTE,
    theme: {
      typography: {
        ...BASE_TYPOGRAPHY,
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
    diagram: true,
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
  const [menuOpen, setMenuOpen] = useState(false);

  // Recompute the plugin bundle when the theme changes so the code plugin's
  // shiki theme stays in sync. Other plugins are theme-independent.
  const plugins = React.useMemo(() => {
    const byName: Record<string, InksetPlugin> = {
      code: CODE_PLUGINS_BY_THEME[themeKey] ?? CODE_PLUGINS_BY_THEME.default,
      math: mathPlugin,
      table: tablePlugin,
      diagram: DIAGRAM_PLUGINS_BY_THEME[themeKey] ?? DIAGRAM_PLUGINS_BY_THEME.default,
    };
    return Object.entries(enabledPlugins)
      .filter(([, enabled]) => enabled)
      .map(([name]) => byName[name])
      .filter(Boolean);
  }, [enabledPlugins, themeKey]);

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

  const activePalette = THEMES[themeKey].palette;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        background: "var(--pg-bg)",
        color: "var(--pg-text-primary)",
        ...paletteToCssVars(activePalette),
      }}
    >
      <header
        className="pg-header"
        style={{
          padding: "12px 20px",
          borderBottom: "1px solid var(--pg-border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          background: "var(--pg-bg)",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: "-0.015em",
              fontFeatureSettings: '"ss01"',
            }}
          >
            inkset
          </h1>
          <span className="pg-playground-label" style={{ ...SMALL_CAPS_LABEL, opacity: 0.55 }}>
            playground
          </span>
          <Link
            href="/compare"
            className="pg-compare-link"
            style={{
              fontSize: 13,
              color: "var(--pg-text-muted)",
              textDecoration: "none",
              padding: "3px 9px",
              border: "1px solid var(--pg-border-default)",
              borderRadius: 999,
              marginLeft: 4,
            }}
          >
            compare →
          </Link>
        </div>

        <button
          className="pg-menu-btn"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            border: "1px solid var(--pg-border-default)",
            background: "transparent",
            color: "var(--pg-text-primary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <MenuIcon />
        </button>

        <div
          className="pg-desktop-controls"
          style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 13 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ ...SMALL_CAPS_LABEL, opacity: 0.5, marginRight: 4 }}>theme</span>
            {(Object.keys(THEMES) as ThemeKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setThemeKey(key)}
                style={{
                  padding: "3px 9px",
                  fontSize: 13,
                  border:
                    themeKey === key
                      ? "1px solid var(--pg-border-strong)"
                      : "1px solid var(--pg-border-default)",
                  borderRadius: 999,
                  background: themeKey === key ? "var(--pg-chip-active-bg)" : "transparent",
                  color: themeKey === key ? "var(--pg-chip-active-text)" : "var(--pg-text-muted)",
                  cursor: "pointer",
                }}
              >
                {THEMES[key].label}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 18, background: "var(--pg-divider)" }} />

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
              <span style={{ opacity: 0.6, fontSize: 11 }}>
                ({shrinkwrapMode})
              </span>
            )}
          </label>

          <div style={{ width: 1, height: 18, background: "var(--pg-divider)" }} />

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
          className="pg-aside"
          style={{
            width: MARKDOWN_PANEL_WIDTH,
            flexShrink: 0,
            borderRight: "1px solid var(--pg-border-subtle)",
            display: "flex",
            flexDirection: "column",
            background: "var(--pg-bg)",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              ...SMALL_CAPS_LABEL,
              opacity: 0.55,
              borderBottom: "1px solid var(--pg-border-subtle)",
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
              fontFamily: READING_MONO_FAMILY,
              fontSize: 13,
              lineHeight: 1.6,
              fontFeatureSettings: '"calt", "ss02"',
              background: "var(--pg-bg)",
              color: "var(--pg-sidebar-code-text)",
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
            background: "var(--pg-bg)",
          }}
        >
          {/* Scrollable transcript */}
          <div
            className="pg-chat-scroll"
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

      {menuOpen && (
        <MobileMenu
          onClose={() => setMenuOpen(false)}
          activeScenario={activeKey}
          onSelectScenario={(key) => {
            switchScenario(key);
            setMenuOpen(false);
          }}
          scenarios={SCENARIO_LIST}
          themeKey={themeKey}
          onThemeChange={setThemeKey}
          enabledPlugins={enabledPlugins}
          onTogglePlugin={(name) =>
            setEnabledPlugins((prev) => ({
              ...prev,
              [name]: !prev[name as keyof typeof prev],
            }))
          }
          hyphenationEnabled={hyphenationEnabled}
          onToggleHyphenation={() => setHyphenationEnabled((v) => !v)}
          shrinkwrapMode={shrinkwrapMode}
          onToggleShrinkwrap={() =>
            setShrinkwrapMode((m) => (m === "off" ? "headings" : m === "headings" ? "on" : "off"))
          }
        />
      )}
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
      className="pg-scenario-strip"
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
          ...SMALL_CAPS_LABEL,
          opacity: 0.5,
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
            fontSize: 13,
            border:
              active === s.key
                ? "1px solid var(--pg-border-strong)"
                : "1px solid var(--pg-border-default)",
            borderRadius: 999,
            background: active === s.key ? "var(--pg-chip-active-bg)" : "transparent",
            color: active === s.key ? "var(--pg-chip-active-text)" : "var(--pg-text-muted)",
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
          background: "var(--pg-user-bubble-bg)",
          color: "var(--pg-user-bubble-text)",
          fontSize: 15,
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
          font={READING_FONT_FAMILY}
          fontSize={15}
          lineHeight={24}
          blockMargin={12}
          hyphenation={hyphenation}
          shrinkwrap={shrinkwrap}
          theme={theme}
          loadingFallback={<ThinkingFallback />}
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
      className="pg-chat-input-wrap"
      style={{
        borderTop: "1px solid var(--pg-border-subtle)",
        padding: `14px ${CHAT_SIDE_PADDING}px 20px`,
        background: "var(--pg-bg)",
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
              border: "1px solid var(--pg-border-default)",
              borderRadius: 12,
              background: "var(--pg-surface)",
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            <div
              style={{
                ...SMALL_CAPS_LABEL,
                opacity: 0.4,
                marginBottom: 6,
              }}
            >
              preview · rendered by inkset
            </div>
            <Inkset
              content={value}
              plugins={plugins}
              width={Math.max(0, width - 28)}
              font={READING_FONT_FAMILY}
              fontSize={15}
              lineHeight={22}
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
            border: focused
              ? "1px solid var(--pg-border-strong)"
              : "1px solid var(--pg-border-default)",
            borderRadius: 22,
            background: "var(--pg-surface)",
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
              color: "var(--pg-text-primary)",
              fontSize: 15,
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
              background: value.trim() ? "var(--pg-submit-bg)" : "var(--pg-submit-disabled-bg)",
              color: value.trim() ? "var(--pg-submit-text)" : "var(--pg-submit-disabled-text)",
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
            fontSize: 13,
            opacity: 0.4,
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
        background: active ? "var(--pg-chip-active-bg)" : "transparent",
        color: active ? "var(--pg-text-primary)" : "var(--pg-text-muted)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 120ms, color 120ms",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.color = "var(--pg-text-primary)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = "var(--pg-text-muted)";
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

function ThinkingFallback() {
  return (
    <div
      role="status"
      aria-label="Thinking"
      style={{ padding: "12px 0", fontSize: 15, lineHeight: 1.4 }}
    >
      <span className="pg-shimmer">Thinking…</span>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="6" y1="18" x2="18" y2="6" />
    </svg>
  );
}

// ── Mobile menu ────────────────────────────────────────────────────

type MobileMenuProps = {
  onClose: () => void;
  activeScenario: string;
  onSelectScenario: (key: string) => void;
  scenarios: Scenario[];
  themeKey: ThemeKey;
  onThemeChange: (key: ThemeKey) => void;
  enabledPlugins: Record<string, boolean>;
  onTogglePlugin: (name: string) => void;
  hyphenationEnabled: boolean;
  onToggleHyphenation: () => void;
  shrinkwrapMode: "off" | "headings" | "on";
  onToggleShrinkwrap: () => void;
};

function MobileMenu({
  onClose,
  activeScenario,
  onSelectScenario,
  scenarios,
  themeKey,
  onThemeChange,
  enabledPlugins,
  onTogglePlugin,
  hyphenationEnabled,
  onToggleHyphenation,
  shrinkwrapMode,
  onToggleShrinkwrap,
}: MobileMenuProps) {
  return (
    <div
      className="pg-mobile-menu"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.55)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--pg-bg)",
          borderBottom: "1px solid var(--pg-border-subtle)",
          padding: "14px 16px 20px",
          maxHeight: "85dvh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <span style={{ ...SMALL_CAPS_LABEL, opacity: 0.55 }}>menu</span>
          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid var(--pg-border-default)",
              background: "transparent",
              color: "var(--pg-text-primary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CloseIcon />
          </button>
        </div>

        <Section label="examples">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {scenarios.map((s) => (
              <button
                key={s.key}
                onClick={() => onSelectScenario(s.key)}
                style={{
                  padding: "10px 14px",
                  fontSize: 15,
                  textAlign: "left",
                  border:
                    activeScenario === s.key
                      ? "1px solid var(--pg-border-strong)"
                      : "1px solid var(--pg-border-default)",
                  borderRadius: 10,
                  background:
                    activeScenario === s.key ? "var(--pg-chip-active-bg)" : "transparent",
                  color:
                    activeScenario === s.key
                      ? "var(--pg-chip-active-text)"
                      : "var(--pg-text-primary)",
                  cursor: "pointer",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Section>

        <Section label="theme">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(Object.keys(THEMES) as ThemeKey[]).map((key) => (
              <button
                key={key}
                onClick={() => onThemeChange(key)}
                style={{
                  padding: "6px 12px",
                  fontSize: 13,
                  border:
                    themeKey === key
                      ? "1px solid var(--pg-border-strong)"
                      : "1px solid var(--pg-border-default)",
                  borderRadius: 999,
                  background: themeKey === key ? "var(--pg-chip-active-bg)" : "transparent",
                  color:
                    themeKey === key ? "var(--pg-chip-active-text)" : "var(--pg-text-muted)",
                  cursor: "pointer",
                }}
              >
                {THEMES[key].label}
              </button>
            ))}
          </div>
        </Section>

        <Section label="plugins">
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 15 }}>
            {Object.entries(enabledPlugins).map(([name, enabled]) => (
              <label
                key={name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  cursor: "pointer",
                  opacity: enabled ? 1 : 0.55,
                }}
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => onTogglePlugin(name)}
                  style={{ accentColor: "#888", width: 18, height: 18 }}
                />
                {name}
              </label>
            ))}
          </div>
        </Section>

        <Section label="layout">
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 15 }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                opacity: hyphenationEnabled ? 1 : 0.55,
              }}
            >
              <input
                type="checkbox"
                checked={hyphenationEnabled}
                onChange={onToggleHyphenation}
                style={{ accentColor: "#888", width: 18, height: 18 }}
              />
              hyphens
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                opacity: shrinkwrapMode !== "off" ? 1 : 0.55,
              }}
            >
              <input
                type="checkbox"
                checked={shrinkwrapMode !== "off"}
                onChange={onToggleShrinkwrap}
                style={{ accentColor: "#888", width: 18, height: 18 }}
              />
              shrinkwrap
              {shrinkwrapMode !== "off" && (
                <span style={{ opacity: 0.6, fontSize: 13, marginLeft: 4 }}>
                  ({shrinkwrapMode})
                </span>
              )}
            </label>
          </div>
        </Section>

        <div style={{ marginTop: 20, borderTop: "1px solid var(--pg-border-subtle)", paddingTop: 16 }}>
          <Link
            href="/compare"
            onClick={onClose}
            style={{
              display: "inline-block",
              fontSize: 14,
              color: "var(--pg-text-muted)",
              textDecoration: "none",
              padding: "8px 14px",
              border: "1px solid var(--pg-border-default)",
              borderRadius: 999,
            }}
          >
            side-by-side comparison →
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ ...SMALL_CAPS_LABEL, opacity: 0.5, marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}
