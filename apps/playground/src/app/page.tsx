"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Preframe } from "@preframe/react";
import { createCodePlugin } from "@preframe/code";
import { createMathPlugin } from "@preframe/math";
import { createTablePlugin } from "@preframe/table";

// ── Sample content presets ─────────────────────────────────────────

const PRESETS: Record<string, string> = {
  mixed: `# Welcome to Preframe

This is a **streaming markdown renderer** powered by pretext for responsive layout.

## Code Example

\`\`\`python
def fibonacci(n: int) -> int:
    """Calculate the nth Fibonacci number."""
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b

# Calculate first 10 Fibonacci numbers
for i in range(10):
    print(f"F({i}) = {fibonacci(i)}")
\`\`\`

## Math

The quadratic formula:

$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

Euler's identity: $e^{i\\pi} + 1 = 0$

## Table

| Language | Typing | Speed | Popularity |
|----------|--------|-------|------------|
| Python | Dynamic | Slow | Very High |
| Rust | Static | Fast | Growing |
| TypeScript | Static | Medium | High |
| Go | Static | Fast | High |

## Why Preframe?

Every chat UI renders markdown and hopes the browser handles layout. Preframe uses **pretext** to measure text without DOM reflow, achieving 300-600x faster layout on resize.`,

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
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const plugins = Object.entries(enabledPlugins)
    .filter(([, enabled]) => enabled)
    .map(([name]) => ALL_PLUGINS[name as keyof typeof ALL_PLUGINS]);

  // Resize handle drag
  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      setPanelWidth(Math.max(280, Math.min(newWidth, window.innerWidth - 400)));
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // Streaming simulation
  const simulateStream = useCallback(() => {
    const text = PRESETS.streaming;
    const words = text.split(/(\s+)/);
    let idx = 0;
    setIsStreaming(true);
    setStreamedContent("");

    const interval = setInterval(() => {
      if (idx >= words.length) {
        clearInterval(interval);
        setIsStreaming(false);
        return;
      }
      // Add 1-3 words at a time to simulate token chunks
      const chunk = words.slice(idx, idx + Math.ceil(Math.random() * 3)).join("");
      idx += Math.ceil(Math.random() * 3);
      setStreamedContent((prev) => prev + chunk);
    }, 30);

    return () => clearInterval(interval);
  }, []);

  const displayContent = isStreaming ? streamedContent : content;

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
                  setActivePreset(name);
                  setContent(PRESETS[name]);
                  setIsStreaming(false);
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
      <div
        ref={containerRef}
        style={{ display: "flex", flex: 1, overflow: "hidden" }}
      >
        {/* Markdown input */}
        <div
          style={{
            width: 360,
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
              setContent(e.target.value);
              setIsStreaming(false);
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
        <div style={{ flex: 1, display: "flex", position: "relative" }}>
          <div
            style={{
              width: panelWidth,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
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
              <span>{panelWidth}px</span>
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
                fontSize={15}
                lineHeight={22}
                blockMargin={12}
              />
            </div>
          </div>

          {/* Resize handle */}
          <div
            onMouseDown={handleMouseDown}
            style={{
              width: 6,
              cursor: "col-resize",
              background: isDragging.current ? "#444" : "#222",
              flexShrink: 0,
              transition: "background 0.1s",
            }}
            title="Drag to resize"
          />

          {/* Metrics panel */}
          <div
            style={{
              flex: 1,
              minWidth: 200,
              padding: 16,
              fontSize: 12,
              fontFamily: "ui-monospace, monospace",
              opacity: 0.6,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 4 }}>
              METRICS
            </div>
            <div>Panel width: {panelWidth}px</div>
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
