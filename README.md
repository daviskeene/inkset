# inkset

A streaming markdown renderer for LLM output, powered by [pretext](https://github.com/chenglou/pretext) for DOM-free text measurement and layout.

Most chat UIs stream tokens into the page and let the browser figure out where things go. This works until someone resizes the window, or the response has code and math, or the stream is fast enough that layout can't keep up. Then you get jitter.

Inkset measures text once with pretext, then re-layouts with arithmetic. No DOM reads in the hot path. Resize 1000 blocks in under a millisecond.

## Install

```bash
npm install @inkset/core @inkset/react
```

Optional plugins:

```bash
npm install @inkset/code    # Shiki syntax highlighting
npm install @inkset/math    # KaTeX or MathJax math rendering
npm install @inkset/table   # Responsive tables
```

## Quick start

```tsx
import { Inkset } from "@inkset/react";
import { createCodePlugin } from "@inkset/code";
import { createMathPlugin } from "@inkset/math";

const plugins = [createCodePlugin(), createMathPlugin()];

function Chat({ message }) {
  return (
    <Inkset
      content={message.text}
      streaming={message.isStreaming}
      plugins={plugins}
    />
  );
}
```

For more control, use the hook directly:

```tsx
import { useInkset } from "@inkset/react";

function StreamingChat() {
  const { containerRef, appendToken, endStream } = useInkset({
    plugins: [createCodePlugin(), createMathPlugin()],
  });

  // Call appendToken() as tokens arrive from your LLM
  // Call endStream() when the response is complete

  return <div ref={containerRef} />;
}
```

## How it works

```
Token arrives → Ingest (syntax repair)
             → Parse (remark/rehype per block)
             → Transform (plugins enrich AST)
             → Measure (pretext prepare, cached)
             → Layout (pretext arithmetic)
             → Render (absolute positioning, flow for hot block)
```

Frozen blocks use absolute positioning with pretext-computed coordinates. The actively streaming block uses normal document flow so CSS handles its height natively. No measurement race, no flicker.

On resize, only `pretext.layout()` re-runs for each block. That's pure arithmetic over cached measurements, about 0.0002ms per block.

## Plugins

Plugins participate in the full pipeline. They transform AST nodes, measure their own dimensions, and render as React components.

```tsx
import { createCodePlugin } from "@inkset/code";
import { createMathPlugin, createKaTeXRenderer, createMathJaxRenderer } from "@inkset/math";
import { createTablePlugin } from "@inkset/table";

// KaTeX (default, fast)
createMathPlugin();

// MathJax (broader LaTeX support)
createMathPlugin({ renderer: createMathJaxRenderer() });

// Shiki with custom theme
createCodePlugin({ theme: "github-light" });
```

Writing a custom plugin:

```tsx
const myPlugin: InksetPlugin = {
  name: "custom-chart",
  handles: ["code"],  // handle code fence blocks
  transform(node, ctx) {
    if (node.lang !== "chart") return node;
    return { ...node, transformedBy: "custom-chart", pluginData: { spec: node.value } };
  },
  measure(node, maxWidth) {
    return { width: maxWidth, height: 300 };
  },
  component: ({ node }) => <MyChart spec={node.pluginData.spec} />,
};
```

## Packages

| Package | What it does |
|---------|-------------|
| `@inkset/core` | Pipeline engine: ingest, parse, measure, layout |
| `@inkset/react` | `<Inkset>` component and `useInkset()` hook |
| `@inkset/code` | Shiki syntax highlighting with streaming support |
| `@inkset/math` | KaTeX or MathJax rendering, delimiter normalization |
| `@inkset/table` | Responsive tables with horizontal scroll and CSV copy |

## Development

```bash
pnpm install
pnpm --filter @inkset/core test     # 55 unit tests
pnpm --filter @inkset/core build    # Build core
pnpm --filter @inkset/playground dev # Playground at localhost:3333
```

## Status

Early. The core pipeline works, plugins render code and math, the hybrid layout model handles streaming without flicker. Pretext integration falls back to character-width estimates when Canvas isn't available (SSR). The measurement layer is block-type-aware but not pixel-perfect yet for all content types.

See [TODOS.md](./TODOS.md) for what's planned.

## License

MIT
