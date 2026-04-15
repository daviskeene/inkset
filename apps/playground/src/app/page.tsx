"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Preframe } from "@preframe/react";
import { createCodePlugin } from "@preframe/code";
import { createMathPlugin } from "@preframe/math";
import { createTablePlugin } from "@preframe/table";

const MARKDOWN_PANEL_WIDTH = 360;
const MIN_RENDER_PANEL_WIDTH = 320;
const METRICS_PANEL_MIN_WIDTH = 220;
const RESIZE_HANDLE_WIDTH = 8;
const COMPACT_OUTPUT_BREAKPOINT = 860;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getMaxRenderPanelWidth(containerWidth: number) {
  return Math.max(
    MIN_RENDER_PANEL_WIDTH,
    containerWidth - RESIZE_HANDLE_WIDTH - METRICS_PANEL_MIN_WIDTH,
  );
}

// ── Sample content presets ─────────────────────────────────────────

const PRESETS: Record<string, string> = {
  mixed: `# Preframe: AI Output Rendering Without Reflow

**Preframe** is a renderer for AI-generated markdown that treats text layout as data, not as an accidental side effect of the DOM.

Most markdown renderers stream tokens into live DOM, then rely on browser layout to figure out where everything lands. That works until the output becomes dense, code-heavy, math-heavy, or resizable. Then every update turns into a choreography of reflow, repaint, height correction, and visual instability.

> Preframe separates **measurement**, **layout**, and **rendering**. That architectural split is the unlock.

## Why this matters

If a renderer measures text with DOM reads like \`getBoundingClientRect()\`, then streaming and resizing compete with the browser's layout engine.

Preframe uses **pretext** to prepare text once and re-layout it with pure arithmetic:

\`\`\`ts
const prepared = pretext.prepare(markdownText, "400 15px system-ui");
const next = pretext.layout(prepared, containerWidth, 22);

// No DOM probing in the hot path.
// Width changes become data changes, not reflow events.
\`\`\`

That changes what is possible for AI interfaces:

$$t_{resize} \\approx t_{layout\\ math} + t_{paint}$$

instead of

$$t_{resize} \\approx t_{DOM\\ reflow} + t_{measurement} + t_{patching} + t_{paint}$$

## Preframe vs DOM-first renderers

Tools like **Streamdown** and other DOM-first markdown renderers focus on turning model output into HTML quickly. Preframe is optimizing for a different problem:

| Concern | DOM-first markdown renderers | Preframe |
|---------|------------------------------|----------|
| Text measurement | Browser layout / DOM reads | **pretext** |
| Resize path | Reflow-driven | Arithmetic-driven |
| Streaming stability | Patch DOM as tokens arrive | Preserve measured layout as content evolves |
| Plugins | Usually post-render enhancement | Native code / math / table pipeline |
| Goal | Render markdown | **Render model output predictably at interactive speed** |

## Native plugin pipeline

Preframe is built for the kinds of blocks LLMs actually emit:

\`\`\`python
def score_renderer(reflow_ms: float, layout_ms: float, plugin_ready: bool) -> str:
    if layout_ms < 1 and plugin_ready and reflow_ms == 0:
        return "feels instant"
    if layout_ms < 8:
        return "good enough for chat"
    return "browser is doing too much work"
\`\`\`

It also handles structured content without treating it as an afterthought:

$$\\text{throughput gain} = \\frac{t_{DOM\\ layout}}{t_{pretext\\ relayout}}$$

and

| Output type | Why it is hard | What Preframe does |
|-------------|----------------|--------------------|
| Long prose | Rewraps constantly on resize | Re-layout from prepared text |
| Code blocks | Syntax UI changes measured height | Plugin-aware measurement + rendering |
| Math | Incomplete formulas flicker during stream | Stream-safe math fallback and final render |
| Tables | Headers, cells, and overflow shift visually | Structured table plugin with stable sizing |

## What this unlocks

Preframe is not just "markdown, but faster." It is the basis for:

- chat UIs that stream without jitter
- inspectors and copilots with continuously resizable panels
- AI workspaces with code, math, and tables in the same response
- plugin-native rendering pipelines where layout remains predictable

This playground exists to show that responsive AI output does **not** have to mean fragile DOM-driven layout.`,

  "code-heavy": `## Algorithm Comparison

### Bubble Sort

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

### Quick Sort

\`\`\`typescript
function quickSort(arr: number[]): number[] {
  if (arr.length <= 1) return arr;
  const pivot = arr[Math.floor(arr.length / 2)];
  const left = arr.filter(x => x < pivot);
  const middle = arr.filter(x => x === pivot);
  const right = arr.filter(x => x > pivot);
  return [...quickSort(left), ...middle, ...quickSort(right)];
}
\`\`\`

### Merge Sort

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
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    result.push(a[i] < b[j] ? a[i++] : b[j++]);
  }
  return [...result, ...a.slice(i), ...b.slice(j)];
}
\`\`\``,

  "math-heavy": `## Linear Algebra Fundamentals

### Matrix Multiplication

Given matrices $A \\in \\mathbb{R}^{m \\times n}$ and $B \\in \\mathbb{R}^{n \\times p}$:

$$(AB)_{ij} = \\sum_{k=1}^{n} a_{ik} b_{kj}$$

### Eigenvalue Decomposition

For a square matrix $A$, if $Av = \\lambda v$ where $v \\neq 0$:

$$\\det(A - \\lambda I) = 0$$

### Singular Value Decomposition

Any matrix $M \\in \\mathbb{R}^{m \\times n}$ can be decomposed as:

$$M = U \\Sigma V^*$$

where $U$ is $m \\times m$ unitary, $\\Sigma$ is $m \\times n$ diagonal, and $V^*$ is $n \\times n$ unitary.

### The Fourier Transform

$$\\hat{f}(\\xi) = \\int_{-\\infty}^{\\infty} f(x) e^{-2\\pi i x \\xi} \\, dx$$

### Maxwell's Equations

$$\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}$$

$$\\nabla \\times \\mathbf{B} = \\mu_0 \\mathbf{J} + \\mu_0 \\epsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}$$`,

  streaming: `# Streaming Demo

Watch this content appear token by token, simulating an LLM response...

The **key insight** behind preframe is that text measurement and rendering are *separate concerns*.

Traditional renderers measure text by inserting it into the DOM and reading \`getBoundingClientRect()\`. This triggers synchronous layout reflow.

Preframe uses **pretext** to measure text via Canvas, then positions blocks with absolute coordinates. On resize, only the layout math re-runs.

\`\`\`javascript
// This is the hot path — pure arithmetic
const layout = computeLayout(measured, { containerWidth });
// ~0.0002ms per block. 1000 blocks < 0.2ms.
\`\`\`

$$\\text{speedup} = \\frac{t_{\\text{DOM reflow}}}{t_{\\text{pretext layout}}} \\approx 300\\text{-}600\\times$$

That's the thesis. Resize the panel to see it in action.`,
};

// ── Plugins ────────────────────────────────────────────────────────

const codePlugin = createCodePlugin({ theme: "github-dark" });
const mathPlugin = createMathPlugin();
const tablePlugin = createTablePlugin();

const ALL_PLUGINS = { code: codePlugin, math: mathPlugin, table: tablePlugin };

// ── Playground page ────────────────────────────────────────────────

export default function PlaygroundPage() {
  const [content, setContent] = useState(PRESETS.mixed);
  const [activePreset, setActivePreset] = useState("mixed");
  const [enabledPlugins, setEnabledPlugins] = useState({
    code: true,
    math: true,
    table: true,
  });
  const [panelWidth, setPanelWidth] = useState(600);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [outputAreaWidth, setOutputAreaWidth] = useState(0);
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const outputAreaRef = useRef<HTMLDivElement>(null);
  const panelWidthFrameRef = useRef<number | null>(null);
  const pendingPanelWidthRef = useRef<number | null>(null);

  const plugins = Object.entries(enabledPlugins)
    .filter(([, enabled]) => enabled)
    .map(([name]) => ALL_PLUGINS[name as keyof typeof ALL_PLUGINS]);

  const resetGlobalInteractionState = useCallback(() => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  const resetDragState = useCallback(() => {
    setIsDragging(false);
    resetGlobalInteractionState();
  }, [resetGlobalInteractionState]);

  const clampPanelWidth = useCallback((nextWidth: number) => {
    const containerWidth = outputAreaRef.current?.clientWidth ?? nextWidth;
    return clamp(
      nextWidth,
      MIN_RENDER_PANEL_WIDTH,
      getMaxRenderPanelWidth(containerWidth),
    );
  }, []);

  const flushPanelWidth = useCallback(() => {
    panelWidthFrameRef.current = null;
    const nextWidth = pendingPanelWidthRef.current;
    pendingPanelWidthRef.current = null;
    if (typeof nextWidth === "number") {
      setPanelWidth(nextWidth);
    }
  }, []);

  const schedulePanelWidthCommit = useCallback((nextWidth: number) => {
    pendingPanelWidthRef.current = nextWidth;
    if (panelWidthFrameRef.current !== null) {
      return;
    }

    panelWidthFrameRef.current = requestAnimationFrame(() => {
      flushPanelWidth();
    });
  }, [flushPanelWidth]);

  const isCompactOutput = outputAreaWidth > 0 && outputAreaWidth < COMPACT_OUTPUT_BREAKPOINT;
  const effectivePanelWidth = isCompactOutput
    ? Math.max(0, outputAreaWidth)
    : clampPanelWidth(panelWidth);

  const stopStreaming = useCallback(() => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isCompactOutput) return;
      event.preventDefault();
      setIsDragging(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [isCompactOutput],
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!isDragging || !outputAreaRef.current) return;
      const rect = outputAreaRef.current.getBoundingClientRect();
      schedulePanelWidthCommit(clampPanelWidth(event.clientX - rect.left));
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", resetDragState);
    window.addEventListener("pointercancel", resetDragState);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", resetDragState);
      window.removeEventListener("pointercancel", resetDragState);
    };
  }, [clampPanelWidth, isDragging, resetDragState, schedulePanelWidthCommit]);

  useEffect(() => {
    const container = outputAreaRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) {
        setOutputAreaWidth(width);
        setPanelWidth((currentWidth) =>
          clamp(
            currentWidth,
            MIN_RENDER_PANEL_WIDTH,
            getMaxRenderPanelWidth(width),
          ),
        );
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Streaming simulation
  const simulateStream = useCallback(() => {
    stopStreaming();
    const text = PRESETS.streaming;
    const words = text.split(/(\s+)/);
    const initialChunkSize = Math.min(6, words.length);
    let idx = initialChunkSize;
    setActivePreset("streaming");
    setContent(text);
    setIsStreaming(true);
    setStreamedContent(words.slice(0, initialChunkSize).join(""));

    streamIntervalRef.current = setInterval(() => {
      if (idx >= words.length) {
        if (streamIntervalRef.current) {
          clearInterval(streamIntervalRef.current);
          streamIntervalRef.current = null;
        }
        setStreamedContent(text);
        setIsStreaming(false);
        return;
      }
      // Add 1-3 words at a time to simulate token chunks
      const chunkSize = Math.ceil(Math.random() * 3);
      const chunk = words.slice(idx, idx + chunkSize).join("");
      idx += chunkSize;
      setStreamedContent((prev) => prev + chunk);
    }, 30);
  }, [stopStreaming]);

  useEffect(() => {
    return () => {
      stopStreaming();
      resetGlobalInteractionState();
      if (panelWidthFrameRef.current !== null) {
        cancelAnimationFrame(panelWidthFrameRef.current);
      }
    };
  }, [resetGlobalInteractionState, stopStreaming]);

  const displayContent = isStreaming ? streamedContent : content;
  const renderContentWidth = Math.max(0, effectivePanelWidth - 32);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Header */}
      <header
        style={{
          padding: "12px 24px",
          borderBottom: "1px solid #222",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            preframe
          </h1>
          <span style={{ fontSize: 12, opacity: 0.5 }}>playground</span>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Preset selector */}
          {Object.keys(PRESETS).map((name) => (
            <button
              key={name}
              onClick={() => {
                if (name === "streaming") {
                  simulateStream();
                } else {
                  stopStreaming();
                  setActivePreset(name);
                  setContent(PRESETS[name]);
                }
              }}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                border: "1px solid #333",
                borderRadius: 4,
                background: activePreset === name ? "#333" : "transparent",
                color: "#ededed",
                cursor: "pointer",
              }}
            >
              {name}
            </button>
          ))}

          <div style={{ width: 1, height: 20, background: "#333", margin: "0 4px" }} />

          {/* Plugin toggles */}
          {Object.entries(enabledPlugins).map(([name, enabled]) => (
            <label
              key={name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                cursor: "pointer",
                opacity: enabled ? 1 : 0.4,
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
                style={{ accentColor: "#666" }}
              />
              {name}
            </label>
          ))}
        </div>
      </header>

      {/* Main content area */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Markdown input */}
        <div
          style={{
            width: MARKDOWN_PANEL_WIDTH,
            flexShrink: 0,
            borderRight: "1px solid #222",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              fontSize: 11,
              opacity: 0.5,
              borderBottom: "1px solid #222",
            }}
          >
            MARKDOWN INPUT
          </div>
          <textarea
            value={isStreaming ? streamedContent : content}
            onChange={(e) => {
              stopStreaming();
              setContent(e.target.value);
            }}
            readOnly={isStreaming}
            style={{
              flex: 1,
              padding: 12,
              fontFamily: "ui-monospace, monospace",
              fontSize: 13,
              lineHeight: 1.5,
              background: "#111",
              color: "#ccc",
              border: "none",
              resize: "none",
              outline: "none",
            }}
            spellCheck={false}
          />
        </div>

        {/* Rendered output (resizable) */}
        <div
          ref={outputAreaRef}
          style={{
            flex: 1,
            display: "flex",
            position: "relative",
            minWidth: 0,
            flexDirection: isCompactOutput ? "column" : "row",
          }}
        >
          <div
            style={{
              width: isCompactOutput ? "100%" : effectivePanelWidth,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              minWidth: 0,
            }}
          >
            <div
              style={{
                padding: "8px 12px",
                fontSize: 11,
                opacity: 0.5,
                borderBottom: "1px solid #222",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>RENDERED OUTPUT</span>
              <span>{Math.round(effectivePanelWidth)}px</span>
            </div>
            <div
              style={{
                flex: 1,
                overflow: "auto",
                padding: 16,
                background: "#0f0f0f",
              }}
            >
              <Preframe
                content={displayContent}
                streaming={isStreaming}
                plugins={plugins}
                width={renderContentWidth}
                fontSize={15}
                lineHeight={22}
                blockMargin={12}
              />
            </div>
          </div>

          {/* Resize handle */}
          <div
            onPointerDown={handlePointerDown}
            style={{
              width: isCompactOutput ? "100%" : RESIZE_HANDLE_WIDTH,
              height: isCompactOutput ? RESIZE_HANDLE_WIDTH : "auto",
              cursor: isCompactOutput ? "default" : "col-resize",
              background: isCompactOutput ? "#161616" : isDragging ? "#444" : "#222",
              flexShrink: 0,
              transition: "background 0.1s",
              touchAction: "none",
              borderTop: isCompactOutput ? "1px solid #222" : undefined,
              borderBottom: isCompactOutput ? "1px solid #222" : undefined,
            }}
            title={isCompactOutput ? "Resize disabled in compact layout" : "Drag to resize"}
          />

          {/* Metrics panel */}
          <div
            style={{
              flex: isCompactOutput ? "0 0 auto" : 1,
              minWidth: isCompactOutput ? 0 : METRICS_PANEL_MIN_WIDTH,
              padding: 16,
              fontSize: 12,
              fontFamily: "ui-monospace, monospace",
              opacity: 0.6,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              borderTop: isCompactOutput ? "1px solid #222" : undefined,
            }}
          >
            <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 4 }}>
              METRICS
            </div>
            <div>Panel width: {Math.round(effectivePanelWidth)}px</div>
            <div>Plugins: {plugins.map((p) => p.name).join(", ") || "none"}</div>
            <div>Streaming: {isStreaming ? "active" : "idle"}</div>
            <div style={{ marginTop: 16, fontSize: 11, opacity: 0.5 }}>
              Drag the resize handle to see pretext-powered reflow in action.
              Toggle plugins to see progressive enhancement.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
