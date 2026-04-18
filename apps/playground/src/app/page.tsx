"use client";

import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import Link from "next/link";
import { Inkset, type InksetTheme, type RevealProp } from "@inkset/react";
import type { InksetPlugin } from "@inkset/core";
import { createCodePlugin } from "@inkset/code";
import { createMathPlugin } from "@inkset/math";
import { createTablePlugin } from "@inkset/table";
import { createDiagramPlugin } from "@inkset/diagram";
import { reading, mono } from "./fonts";
import {
  type ThemeKey,
  type PagePalette,
  DARK_PALETTE,
  LIGHT_PALETTE,
  SEPIA_PALETTE,
  DUSK_PALETTE,
  getPalette,
  paletteToCssVars,
} from "../lib/themes";
import { useThemeKey } from "../lib/theme-context";
import { SiteNav } from "../components/site-nav";
import { Footer } from "../components/footer";
import {
  BracketToggle,
  CHIP_GROUP_STYLE,
  CHIP_SECTION_LABEL_STYLE,
} from "../components/chip";

const MARKDOWN_PANEL_WIDTH = 340;
const CHAT_MAX_WIDTH = 760;
const CHAT_SIDE_PADDING = 24;

// Reading-column font family as a literal stack (must match CSS so pretext
// measures with the same face the browser paints).
const READING_FONT_FAMILY = `${reading.style.fontFamily}, "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif`;
const READING_MONO_FAMILY = `${mono.style.fontFamily}, ui-monospace, SFMono-Regular, Menlo, monospace`;

// ── Label style ────────────────────────────────────────────────────
// Section/marginalia labels across the playground. Plain sans, lowercase,
// muted color — no caps, no italics, no tracking gymnastics. Kept as
// SMALL_CAPS_LABEL for historical reasons (many call-sites) even though
// the treatment isn't small-caps anymore.
const SMALL_CAPS_LABEL = {
  fontSize: 12.5,
  letterSpacing: 0,
  color: "var(--pg-text-muted)",
};

// ── Scenarios ──────────────────────────────────────────────────────

type Scenario = {
  key: string;
  label: string;
  description: string;
  group: "plugins" | "animations";
  userPrompt: string;
  assistant: string;
  stream?: boolean;
  streamInitialChunkSize?: number;
  reveal?: RevealProp;
};

const STREAM_WITH_ANIMATION_REVEAL: RevealProp = {
  throttle: {
    delayInMs: 58,
    chunking: "word",
  },
  animate: {
    preset: "blurIn",
    duration: 260,
    stagger: 36,
    sep: "word",
  },
};

const INK_BLEED_SHADER_REVEAL: RevealProp = {
  throttle: {
    delayInMs: 56,
    chunking: "word",
  },
  animate: {
    preset: "blurIn",
    duration: 300,
    stagger: 34,
    sep: "word",
    staggerOrder: "layout",
    maxStaggerSpanMs: 520,
  },
  shader: {
    preset: "ink-bleed",
    options: {
      tint: "214, 166, 70",
      alpha: 0.22,
      minLifetimeMs: 520,
      lifetimeScale: 1.7,
      blurStartPx: 8,
      blurEndPx: 24,
      spreadXStart: 0.92,
      spreadXEnd: 1.34,
      spreadYStart: 0.92,
      spreadYEnd: 1.18,
    },
  },
};

// Phase 4 demo: custom RevealComponent. Renders a warm ink-like sweep behind
// each token while the glyphs sharpen into place. Width/height are threaded in
// from pretext so the wash can size itself to the measured token box.
const InkSweepReveal: import("@inkset/react").RevealComponent = ({
  children,
  width,
  height,
  delayMs,
  durationMs,
}: import("@inkset/react").RevealComponentProps) => {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(false);
    const frameId = window.requestAnimationFrame(() => {
      setActive(true);
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  const tokenWidth = Math.max(width, 12);
  const tokenHeight = Math.max(height, 18);
  const sweepHeight = Math.max(tokenHeight * 0.72, 14);
  const sweepOffsetY = Math.max((tokenHeight - sweepHeight) * 0.55, 1);
  const horizontalInset = Math.max(tokenWidth * 0.08, 2);

  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        isolation: "isolate",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: `-${horizontalInset}px`,
          top: `${sweepOffsetY}px`,
          width: `${tokenWidth + horizontalInset * 2}px`,
          height: `${sweepHeight}px`,
          pointerEvents: "none",
          borderRadius: Math.max(sweepHeight * 0.42, 8),
          background:
            "linear-gradient(90deg, rgba(198,142,42,0) 0%, rgba(230,187,84,0.32) 18%, rgba(245,214,128,0.72) 50%, rgba(222,174,66,0.24) 82%, rgba(198,142,42,0) 100%)",
          opacity: active ? 0 : 1,
          transform: active ? "translateX(28%) scaleX(1.08)" : "translateX(-32%) scaleX(0.82)",
          transformOrigin: "left center",
          transitionProperty: "transform, opacity",
          transitionDuration: `${Math.max(durationMs * 0.9, 220)}ms`,
          transitionTimingFunction: "cubic-bezier(.18,.82,.22,1)",
          transitionDelay: `${delayMs}ms`,
          mixBlendMode: "multiply",
          zIndex: 0,
        }}
      />
      <span
        style={{
          position: "relative",
          zIndex: 1,
          display: "inline-block",
          opacity: active ? 1 : 0.18,
          filter: active ? "blur(0px)" : "blur(5px)",
          transform: active ? "translateY(0)" : "translateY(0.05em)",
          transitionProperty: "opacity, filter, transform",
          transitionDuration: `${durationMs}ms`,
          transitionTimingFunction: "cubic-bezier(.2,.82,.2,1)",
          transitionDelay: `${delayMs}ms`,
          willChange: "opacity, filter, transform",
        }}
      >
        {children}
      </span>
    </span>
  );
};

const INK_SWEEP_REVEAL: RevealProp = {
  // Cadence tuned to feel like a steady typed-out stream: ~17 tok/s matches
  // stream-animated, but the custom component leans more editorial than
  // decorative: a short wash + sharpen, not an effects-heavy spectacle.
  throttle: { delayInMs: 60, chunking: "word" },
  animate: {
    preset: "fadeIn",
    duration: 320,
    stagger: 42,
    sep: "word",
    staggerOrder: "layout",
    maxStaggerSpanMs: 600,
  },
  component: InkSweepReveal,
};

const SCENARIO_LIST: Scenario[] = [
  {
    key: "mixed",
    label: "why inkset",
    description: "the pitch — mixed content across plugins",
    group: "plugins",
    userPrompt: "How do I display AI output in my React/Next.js app?",
    assistant: `# Tl;dr: Inkset is a streaming markdown renderer for AI chat UIs in React.

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
    description: "three sorting algorithms, syntax highlighted",
    group: "plugins",
    userPrompt: "Show me three classic sorting algorithms in TypeScript.",
    assistant: `Sure\u00A0— here are the three you'll see in every intro algorithms course, with the implementations kept readable rather than clever:

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
    description: "streaming chat request lifecycle, via mermaid",
    group: "plugins",
    userPrompt: "Sketch the lifecycle of a streaming chat request from user input through response.",
    assistant: `Sure\u00A0— here's the round-trip for a typical chat completion, from keystroke to rendered response:

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
    description: "linear algebra fundamentals, rendered with KaTeX",
    group: "plugins",
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
    description: "plain token-by-token streaming",
    group: "animations",
    userPrompt: "What makes Inkset different from DOM-based renderers?",
    stream: true,
    streamInitialChunkSize: 4,
    assistant: `Watch this reply land token-by-token\u00A0— same pipeline as a real LLM stream.

The **key insight** behind Inkset is that text measurement and rendering are *separate concerns*.

Traditional renderers measure text by inserting it into the DOM and reading \`getBoundingClientRect()\`. That triggers synchronous layout reflow. Fine for a static page. Expensive on every token.

Inkset uses **pretext** to measure text via Canvas, then positions blocks with absolute coordinates. On resize, only the layout math re-runs.

For rich async blocks like math and highlighted code, Inkset also remembers the block's settled height per width, so a narrower-then-wider resize doesn't reintroduce jitter.

\`\`\`javascript
// This is the hot path — pure arithmetic.
const layout = computeLayout(measured, { containerWidth });
// ~0.0002ms per block. 1000 blocks < 0.2ms.
\`\`\`

$$\\text{speedup} = \\frac{t_{\\text{DOM reflow}}}{t_{\\text{pretext layout}}} \\approx 300\\text{-}600\\times$$

That's the thesis. Resize the window mid-stream — even across math or code blocks — and the column stays settled.`,
  },
  {
    key: "stream-animated",
    label: "stream animated",
    description: "throttle + blur-in, staggered by layout order",
    group: "animations",
    userPrompt: "What makes Inkset different from DOM-based renderers?",
    stream: true,
    streamInitialChunkSize: 0,
    reveal: STREAM_WITH_ANIMATION_REVEAL,
    assistant: `This preset is about the **reveal layer**, not just slower token pacing.

Inkset can throttle incoming text, animate each fresh word, and still keep the message column stable while the model is generating.

When multiple words land in the same tick, the reveal doesn't just follow arrival order. Inkset reorders the stagger by each token's pretext-computed **(y, x)**, so the cascade reads **top-to-bottom, left-to-right** across wrapped lines.

That matters because real network streams are bursty. A renderer might receive half a sentence at once. Without layout-aware staggering, those words pop in as one lump. With it, the eye still tracks the sentence in reading order.

\`\`\`ts
reveal={{
  throttle: { delayInMs: 58, chunking: "word" },
  animate: {
    preset: "blurIn",
    staggerOrder: "layout",
  },
}}
\`\`\`

The result is controlled motion during generation, then plain settled text once the stream is done. No post-hoc replay, no resize jitter, no DOM-driven reflow tax.`,
  },
  {
    key: "ink-sweep-reveal",
    label: "ink sweep",
    description: "user-supplied RevealComponent with warm sweep",
    group: "animations",
    userPrompt: "Show me a custom reveal component.",
    stream: true,
    streamInitialChunkSize: 0,
    reveal: INK_SWEEP_REVEAL,
    assistant: `Consumers pass their own **RevealComponent** to the \`reveal\` prop and get the token text, pretext-computed *(x, y, width, height)*, and the animation timing.

This demo uses that hook to paint a warm **ink sweep** behind each fresh word, then sharpen the glyphs into place. The effect stays tied to the measured token box, so the motion reinforces reading order instead of competing with it.

Because the sweep is anchored to the measured token width and line box, it tracks the text as the paragraph wraps, not as some detached decoration floating over the page. That matters once a response gets dense and editorial: long clauses, parenthetical asides, repeated line breaks, and enough horizontal variation that the eye can see the cascade move from line to line instead of just watching a single short sentence blink into place.

It also means the effect survives real layout pressure. Narrow the window, widen it again, and the sweep still belongs to the word it was generated for. The animation is not guessing at DOM geometry after paint; it is riding on the same measurement data the renderer already used to place the block in the first place.

That is the moat streamdown can't match without a pretext-like measurement layer. You need token-aware geometry to place an effect like this cleanly, keep it aligned as the paragraph reflows, and let a custom visual treatment feel typographic rather than ornamental. Once the stream settles, the effect disappears and you are left with plain, readable text instead of a UI that keeps performing after the message is already done.`,
  },
  {
    key: "ink-bleed-shader",
    label: "ink bleed shader",
    description: "canvas shader blooms under each streamed token",
    group: "animations",
    userPrompt: "Show me the shader version.",
    stream: true,
    streamInitialChunkSize: 0,
    reveal: INK_BLEED_SHADER_REVEAL,
    assistant: `This variant moves the flourish out of the DOM tree and into a shader-style overlay.

The text itself is still normal selectable HTML. Inkset measures each fresh word with pretext, streams it into place, and hands the overlay a small packet of geometry: the token's **x**, **y**, **width**, **height**, and reveal timing. The shader uses that packet to bloom a warm ink bleed under the exact word that just arrived.

That split matters. Layout, accessibility, selection, and copy-paste all stay boring and reliable because the text is still text. The canvas layer is just atmosphere. If it fails to initialize, the stream still renders correctly; you merely lose the garnish.

It also means the effect tracks the actual reading path instead of smearing across the whole paragraph. Bursty network ticks still get reordered by layout, so even when several words arrive together the glow follows the line the reader is on rather than the order bytes happened to show up over the wire.

This is the kind of effect that is hard to fake cleanly in a DOM-first renderer. Once you already have token geometry, though, the shader layer becomes simple: treat each new word like a short-lived source of color, let it diffuse for a few hundred milliseconds, and then get out of the way before the message has finished settling.

\`\`\`ts
reveal={{
  throttle: { delayInMs: 56, chunking: "word" },
  animate: { preset: "blurIn", staggerOrder: "layout" },
  shader: { preset: "ink-bleed" },
}}
\`\`\`

The result should feel physical but still editorial: the words arrive, stain the page for a beat, sharpen, and then leave behind plain text.`,
  },
];

const SCENARIOS = Object.fromEntries(SCENARIO_LIST.map((s) => [s.key, s]));

// ── Plugins ────────────────────────────────────────────────────────

// Per-theme-key shiki theme so the syntax highlighter inverts alongside
// the rest of the page. Cached once at module load to match the plugin
// contract (same identity between renders while the key is unchanged).
const CODE_PLUGINS_BY_THEME: Record<string, ReturnType<typeof createCodePlugin>> = {
  dark: createCodePlugin({ theme: "github-dark" }),
  light: createCodePlugin({ theme: "github-light" }),
  sepia: createCodePlugin({ theme: "github-light" }),
  dusk: createCodePlugin({ theme: "github-dark" }),
};
// Mermaid's own theme names — "dark"/"neutral" for dark page, "default"/"neutral"
// for light. Re-instantiated per theme key so the plugin `key` changes and
// the pipeline re-renders existing diagrams on theme switch.
const DIAGRAM_PLUGINS_BY_THEME: Record<string, ReturnType<typeof createDiagramPlugin>> = {
  dark: createDiagramPlugin({ theme: "dark" }),
  light: createDiagramPlugin({ theme: "default" }),
  sepia: createDiagramPlugin({ theme: "neutral" }),
  dusk: createDiagramPlugin({ theme: "dark" }),
};
const mathPlugin = createMathPlugin();
const tablePlugin = createTablePlugin();

// ── Themes ─────────────────────────────────────────────────────────
// Palettes + the ThemeKey union live in `lib/themes.ts` and are shared
// between Playground and Compare. This file owns only the Inkset `theme`
// bindings (typography, colors, code/table styling) per key since those
// depend on the app's font stack. RootChrome (in the root layout) applies
// the palette CSS vars; this page only needs the Inkset theme per key.

// Shared typography defaults applied to every theme so the rendered column
// always reads as a book: serif for body, editorial mono for inline code.
// Libre Franklin's Black/Extra-Bold cuts have tight side-bearings already,
// so we soften the Inkset default heading tracking (-0.04em on h1) to keep
// adjacent glyphs from colliding at large sizes.
const BASE_TYPOGRAPHY = {
  fontFamily: READING_FONT_FAMILY,
  fontFamilyMono: READING_MONO_FAMILY,
  // Tracking left at 0 so pretext's width measurements match the browser's.
  // pretext's `prepare(text, font)` API doesn't accept letter-spacing, so any
  // non-zero tracking produces a line-count disagreement that flickers on
  // resize. Safe to reintroduce once the measure layer can compensate.
  headingTracking: {
    h1: "0",
    h2: "0",
    h3: "0",
    h4: "0",
  },
};

const THEMES: Record<ThemeKey, { label: string; theme: InksetTheme; palette: PagePalette }> = {
  dark: {
    label: "dark",
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
  // Sepia reads like a pocket journal: warm paper bg, dark coffee text,
  // sienna accent for links/marginalia. Code blocks drop to a cream surface
  // so the syntax palette doesn't punch through the warmth.
  sepia: {
    label: "sepia",
    palette: SEPIA_PALETTE,
    theme: {
      colors: {
        text: "#3a2e20",
        textMuted: "rgba(58, 46, 32, 0.72)",
        blockquoteAccent: "#8b4d2b",
        blockquoteText: "rgba(58, 46, 32, 0.82)",
        inlineCodeBg: "rgba(139, 77, 43, 0.10)",
        inlineCodeText: "#3a2e20",
        hr: "rgba(58, 46, 32, 0.15)",
      },
      typography: { ...BASE_TYPOGRAPHY },
      code: {
        background: "#faf3df",
        headerBorderColor: "rgba(58, 46, 32, 0.10)",
      },
      table: {
        border: "rgba(58, 46, 32, 0.12)",
        headerText: "rgba(58, 46, 32, 0.72)",
      },
    },
  },
  // Dusk is reading by lamplight: deep blue-ink bg, cream text, a quiet
  // gold accent. Softer than the default dark; meant for long sessions.
  dusk: {
    label: "dusk",
    palette: DUSK_PALETTE,
    theme: {
      colors: {
        text: "#e6dfc8",
        textMuted: "rgba(230, 223, 200, 0.68)",
        blockquoteAccent: "#d4a55a",
        blockquoteText: "rgba(230, 223, 200, 0.82)",
        inlineCodeBg: "rgba(212, 165, 90, 0.14)",
        inlineCodeText: "#f1ead1",
        hr: "rgba(230, 223, 200, 0.18)",
      },
      typography: { ...BASE_TYPOGRAPHY },
      code: {
        background: "#14172b",
        headerBorderColor: "rgba(230, 223, 200, 0.10)",
      },
      table: {
        border: "rgba(230, 223, 200, 0.12)",
        headerText: "rgba(230, 223, 200, 0.62)",
      },
    },
  },
};

// ── Playground page ────────────────────────────────────────────────

const PlaygroundPage = () => {
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
  const [revealEnabled, setRevealEnabled] = useState(false);
  const { themeKey, setThemeKey } = useThemeKey();

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
      code: CODE_PLUGINS_BY_THEME[themeKey] ?? CODE_PLUGINS_BY_THEME.dark,
      math: mathPlugin,
      table: tablePlugin,
      diagram: DIAGRAM_PLUGINS_BY_THEME[themeKey] ?? DIAGRAM_PLUGINS_BY_THEME.dark,
    };
    return Object.entries(enabledPlugins)
      .filter(([, enabled]) => enabled)
      .map(([name]) => byName[name])
      .filter(Boolean);
  }, [enabledPlugins, themeKey]);

  const activeScenario = SCENARIOS[activeKey] ?? SCENARIOS.mixed;
  const effectiveReveal = revealEnabled ? activeScenario.reveal ?? {} : undefined;

  const stopStreaming = useCallback(() => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const runStream = useCallback(
    (targetContent: string, initialChunkSize = 4) => {
      stopStreaming();
      const words = targetContent.split(/(\s+)/);
      const seedSize = Math.max(0, Math.min(initialChunkSize, words.length));
      let idx = seedSize;
      setStreamedContent(words.slice(0, seedSize).join(""));
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
      setRevealEnabled(Boolean(scenario.reveal));
      if (scenario.stream) {
        runStream(scenario.assistant, scenario.streamInitialChunkSize ?? 4);
      }
    },
    [runStream, stopStreaming],
  );

  const regenerate = useCallback(() => {
    if (activeScenario.stream) {
      runStream(activeScenario.assistant, activeScenario.streamInitialChunkSize ?? 4);
    } else {
      runStream(editedContent, activeScenario.streamInitialChunkSize ?? 4);
    }
  }, [
    activeScenario.assistant,
    activeScenario.stream,
    activeScenario.streamInitialChunkSize,
    editedContent,
    runStream,
  ]);

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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
      }}
    >
      <SiteNav activePage="playground" />

      <ScenarioStrip
        active={activeKey}
        onSelect={switchScenario}
        scenarios={SCENARIO_LIST}
        disabled={isStreaming}
      />

      {/* Page-scoped controls. Two columns that mirror the sidebar/main
          split below so the vertical divider between "typography" and
          "plugins" lines up with the sidebar's right edge. Mobile
          collapses to a single "options" chip that opens the overlay. */}
      <div
        className="pg-playground-controls"
        style={{
          display: "flex",
          borderBottom: "1px solid var(--pg-border-subtle)",
          background: "var(--pg-bg)",
          flexShrink: 0,
        }}
      >
        <div
          className="pg-playground-controls-desktop pg-playground-controls-typography"
          style={{
            // The aside below uses content-box width: 340, so its outer
            // size is 340 content + 1 border = 341. Match that outer size
            // here with border-box width 341 so the dividers land on the
            // same pixel column.
            width: MARKDOWN_PANEL_WIDTH + 1,
            flexShrink: 0,
            boxSizing: "border-box",
            borderRight: "1px solid var(--pg-border-subtle)",
            padding: "8px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <span style={CHIP_SECTION_LABEL_STYLE}>typography</span>
          <div style={{ ...CHIP_GROUP_STYLE, gap: 12, rowGap: 2 }}>
            <BracketToggle
              label="hyphens"
              active={hyphenationEnabled}
              onClick={() => setHyphenationEnabled((v) => !v)}
              title="Insert soft hyphens so Pretext and the browser can break long words"
            />
            <BracketToggle
              label="shrinkwrap"
              active={shrinkwrapMode !== "off"}
              stateLabel={{
                on: shrinkwrapMode === "on" ? "on" : "headings",
                off: "off",
              }}
              onClick={() =>
                setShrinkwrapMode((m) =>
                  m === "off" ? "headings" : m === "headings" ? "on" : "off",
                )
              }
              title="Narrow each paragraph/heading to the width of its longest line"
            />
            <BracketToggle
              label="reveal"
              active={revealEnabled}
              onClick={() => setRevealEnabled((v) => !v)}
              title="Throttle token delivery and fade each word in as it streams"
            />
          </div>
        </div>

        <div
          className="pg-playground-controls-desktop pg-playground-controls-plugins"
          style={{
            flex: 1,
            minWidth: 0,
            padding: "8px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <span style={CHIP_SECTION_LABEL_STYLE}>plugins</span>
          <div style={{ ...CHIP_GROUP_STYLE, gap: 12, rowGap: 2 }}>
            {Object.entries(enabledPlugins).map(([name, enabled]) => (
              <BracketToggle
                key={name}
                label={name}
                active={enabled}
                onClick={() =>
                  setEnabledPlugins((prev) => ({
                    ...prev,
                    [name]: !prev[name as keyof typeof prev],
                  }))
                }
              />
            ))}
          </div>
        </div>

        <button
          className="pg-playground-mobile-options"
          onClick={() => setMenuOpen(true)}
          style={{
            display: "none",
            padding: "5px 12px",
            fontSize: 13,
            border: "1px solid var(--pg-border-default)",
            borderRadius: 999,
            background: "transparent",
            color: "var(--pg-text-primary)",
            cursor: "pointer",
            fontFamily: "inherit",
            alignItems: "center",
            gap: 8,
            margin: "8px 14px 8px auto",
          }}
          aria-label="Open options menu"
        >
          Options
          <MenuIcon />
        </button>
      </div>

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
              padding: "10px 22px",
              fontSize: 13,
              color: "var(--pg-text-primary)",
              borderBottom: "1px solid var(--pg-border-subtle)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>assistant markdown</span>
            <span style={{ color: "var(--pg-text-muted)", fontSize: 12 }}>
              edit to rerender
            </span>
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
              padding: "14px 22px",
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
              <UserBubble text={activeScenario.userPrompt} />

              <AssistantMessage
                key={activeKey}
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
                reveal={effectiveReveal}
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

      <Footer />

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
};

// ── Scenario strip ────────────────────────────────────────────────

const ScenarioStrip = ({
  active,
  onSelect,
  scenarios,
  disabled,
}: {
  active: string;
  onSelect: (key: string) => void;
  scenarios: Scenario[];
  disabled: boolean;
}) => {
  const groupedScenarios = [
    {
      key: "plugins",
      label: "content",
      items: scenarios.filter((scenario) => scenario.group === "plugins"),
    },
    {
      key: "animations",
      label: "motion",
      items: scenarios.filter((scenario) => scenario.group === "animations"),
    },
  ] as const;

  return (
    <div
      className="pg-scenario-strip"
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 18,
        rowGap: 6,
        padding: "7px 22px",
        borderBottom: "1px solid var(--pg-border-subtle)",
        background: "var(--pg-bg)",
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? "none" : undefined,
      }}
    >
      {groupedScenarios.map((group, idx) => (
        <React.Fragment key={group.key}>
          {idx > 0 ? (
            <span
              aria-hidden
              style={{
                width: 1,
                height: 14,
                background: "var(--pg-divider)",
                flexShrink: 0,
              }}
            />
          ) : null}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              columnGap: 16,
              rowGap: 2,
              flexWrap: "wrap",
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 11,
                color: "var(--pg-text-muted)",
                letterSpacing: "0.01em",
                lineHeight: 1.2,
                marginRight: 4,
                whiteSpace: "nowrap",
              }}
            >
              [ {group.label} ]
            </span>
            {group.items.map((scenario) => (
              <ScenarioButton
                key={scenario.key}
                scenario={scenario}
                active={active === scenario.key}
                onSelect={() => onSelect(scenario.key)}
              />
            ))}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};

const ScenarioButton = ({
  scenario,
  active,
  onSelect,
}: {
  scenario: Scenario;
  active: boolean;
  onSelect: () => void;
}) => {
  const [hover, setHover] = useState(false);
  const emphasized = active || hover;

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={scenario.description}
      style={{
        position: "relative",
        padding: "3px 2px 5px",
        border: "none",
        background: "transparent",
        color: emphasized ? "var(--pg-text-primary)" : "var(--pg-text-muted)",
        fontFamily: "inherit",
        fontSize: 13,
        lineHeight: 1.4,
        letterSpacing: "-0.005em",
        cursor: "pointer",
        transition: "color 120ms ease",
      }}
    >
      {scenario.label}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 2,
          right: 2,
          bottom: 0,
          height: 1.5,
          background: active ? "var(--pg-text-primary)" : "transparent",
          transition: "background-color 160ms ease",
        }}
      />
    </button>
  );
};

// ── User bubble ────────────────────────────────────────────────────

const UserBubble = ({ text }: { text: string }) => {
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
};

// ── Assistant message ──────────────────────────────────────────────

type AssistantMessageProps = {
  content: string;
  streaming: boolean;
  plugins: ReturnType<typeof createCodePlugin>[];
  width: number;
  hyphenation: boolean;
  shrinkwrap: boolean | "headings" | "paragraphs";
  theme: InksetTheme | undefined;
  reveal: RevealProp | undefined;
  onRegenerate: () => void;
};

const AssistantMessage = ({
  content,
  streaming,
  plugins,
  width,
  hyphenation,
  shrinkwrap,
  theme,
  reveal,
  onRegenerate,
}: AssistantMessageProps) => {
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
      className="pg-assistant-mount"
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
          headingSizes={[2, 1.5, 1.2, 1]}
          hyphenation={hyphenation}
          shrinkwrap={shrinkwrap}
          theme={theme}
          reveal={reveal}
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
};

// ── Chat input with live Inkset preview ────────────────────────────

const ChatInput = ({
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
}) => {
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
};

// ── Small icon primitives ──────────────────────────────────────────

const IconButton = ({
  onClick,
  label,
  active,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) => {
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
};

const CopyIcon = () => {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
};

const ThumbUpIcon = () => {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 011.92 2.56l-2.33 8A2 2 0 0117.5 22H7V10l4-7a2 2 0 012 1.46z" />
    </svg>
  );
};

const ThumbDownIcon = () => {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 01-1.92-2.56l2.33-8A2 2 0 016.5 2H17v12l-4 7a2 2 0 01-2-1.46z" />
    </svg>
  );
};

const RegenerateIcon = () => {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
};

const SendIcon = () => {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
};

const ThinkingFallback = () => {
  return (
    <div
      role="status"
      aria-label="Thinking"
      style={{ padding: "12px 0", fontSize: 15, lineHeight: 1.4 }}
    >
      <span className="pg-shimmer">Thinking…</span>
    </div>
  );
};

const MenuIcon = () => {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
};

const CloseIcon = () => {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="6" y1="18" x2="18" y2="6" />
    </svg>
  );
};

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

const MobileMenu = ({
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
}: MobileMenuProps) => {
  const groupedScenarios = [
    {
      key: "plugins",
      label: "content",
      items: scenarios.filter((scenario) => scenario.group === "plugins"),
    },
    {
      key: "animations",
      label: "motion",
      items: scenarios.filter((scenario) => scenario.group === "animations"),
    },
  ] as const;

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
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {groupedScenarios.map((group) => (
              <div key={group.key}>
                <div style={{ ...SMALL_CAPS_LABEL, marginBottom: 8 }}>{group.label}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {group.items.map((scenario) => {
                    const isActive = activeScenario === scenario.key;
                    return (
                      <button
                        key={scenario.key}
                        onClick={() => onSelectScenario(scenario.key)}
                        style={{
                          padding: "10px 14px",
                          fontSize: 15,
                          textAlign: "left",
                          border: isActive
                            ? "1px solid var(--pg-border-strong)"
                            : "1px solid var(--pg-border-default)",
                          borderRadius: 10,
                          background: isActive
                            ? "var(--pg-chip-active-bg)"
                            : "transparent",
                          color: "var(--pg-text-primary)",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          gap: 3,
                        }}
                      >
                        <span>{scenario.label}</span>
                        <span style={{ fontSize: 12.5, color: "var(--pg-text-muted)" }}>
                          {scenario.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
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
};

const Section = ({ label, children }: { label: string; children: React.ReactNode }) => {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ ...SMALL_CAPS_LABEL, opacity: 0.5, marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
};

export default PlaygroundPage;
