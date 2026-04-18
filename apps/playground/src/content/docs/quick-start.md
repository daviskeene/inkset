# Quick start

Install Inkset, render a streaming markdown message, and learn the shape of the pipeline it runs underneath.

## Install

Install the core and the React binding; add plugins as you need them.

```bash
npm install @inkset/core @inkset/react
```

Optional plugins:

```bash
npm install @inkset/code    # Shiki syntax highlighting
npm install @inkset/math    # KaTeX or MathJax
npm install @inkset/table   # responsive tables
```

## Render a message

The simplest way to use Inkset is the `<Inkset>` component. Pass it the markdown and a `streaming` flag — Inkset keeps the trailing block in hybrid flow while it's receiving tokens, and freezes completed blocks behind it.

```tsx
import { Inkset } from "@inkset/react";
import { createCodePlugin } from "@inkset/code";
import { createMathPlugin } from "@inkset/math";

const plugins = [createCodePlugin(), createMathPlugin()];

export function Chat({ message }) {
  return <Inkset content={message.text} streaming={message.isStreaming} plugins={plugins} />;
}
```

> **Tip.** Create your plugin list once at module scope. Re-creating plugins on every render invalidates the measurement cache and costs you the 2 ms-per-block prepare step.

### Using the hook directly

For finer control — for example, pushing tokens yourself from an `AsyncIterable` or `ReadableStream` — use `useInkset()`.

```tsx
import { useInkset } from "@inkset/react";

export function StreamingChat() {
  const { containerRef, appendToken, endStream } = useInkset({
    plugins: [createCodePlugin(), createMathPlugin()],
  });

  // Call appendToken(str) as tokens arrive from your LLM.
  // Call endStream() when the response is complete.

  return <div ref={containerRef} />;
}
```

## How it works

Every block of markdown walks the same pipeline once. After that, resizes run only the last step — pure arithmetic over cached measurements.

Frozen blocks sit on absolute coordinates computed from pretext measurements. The currently streaming block uses native document flow, so the browser handles its height natively — no measurement race, no flicker when a token arrives.

### Measurement without the DOM

Inkset uses pretext to measure text with one `Canvas.measureText` call per run. No `getBoundingClientRect`, no forced reflow. The output is a flat list of block extents — width, height, baseline — cached per block.

On resize, only `pretext.layout()` re-runs per block. That's roughly 0.0002 ms per block, which means a thousand-block response relayouts in under a millisecond.

## Packages

Inkset is a small monorepo. Pick the pieces you need; the rest stay out of your bundle.

| Package         | What it does                                           |
| --------------- | ------------------------------------------------------ |
| `@inkset/core`  | Pipeline engine: ingest, parse, measure, layout.       |
| `@inkset/react` | `<Inkset>` component and `useInkset()` hook.           |
| `@inkset/code`  | Shiki syntax highlighting with streaming support.      |
| `@inkset/math`  | KaTeX or MathJax rendering, delimiter normalization.   |
| `@inkset/table` | Responsive tables with horizontal scroll and CSV copy. |

## What to read next

- [How it works](/docs/how-it-works) — the full pipeline, layer by layer.
- [Streaming from an LLM](/docs/streaming) — feeding tokens into `useInkset()`.
- [Writing a plugin](/docs/writing-plugins) — transform, measure, and render custom blocks.
- [Theming](/docs/theming) — CSS custom properties and the atom inheritance model.
