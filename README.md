# inkset

A streaming markdown renderer for AI chat UIs in React, powered by [pretext](https://github.com/chenglou/pretext) for DOM-free text measurement and layout.

Most chat UIs stream tokens into the page and let the browser figure out where things go. That works until someone resizes the window, or the response has code and math, or the stream is fast enough that layout cannot keep up.

Inkset uses pretext to prepare text once and reuse that work during layout. The result is a renderer that stays stable while content streams, adapts across screen widths, and leaves room for richer blocks like code, math, tables, Mermaid diagrams, and reveal effects.

## Install

```bash
npm install @inkset/core @inkset/react
```

Optional plugins:

```bash
npm install @inkset/code     # Shiki syntax highlighting
npm install @inkset/math katex     # Display math via KaTeX
npm install @inkset/table    # Responsive tables
npm install @inkset/diagram mermaid  # Mermaid diagrams
```

## Quick start

```tsx
import { Inkset } from "@inkset/react";
import { createCodePlugin } from "@inkset/code";
import { createMathPlugin } from "@inkset/math";
import "katex/dist/katex.min.css";

const plugins = [createCodePlugin(), createMathPlugin()];

function Chat({ message }) {
  return <Inkset content={message.text} streaming={message.isStreaming} plugins={plugins} />;
}
```

If you want lower-level pipeline access, `useInkset()` is available too:

```tsx
import { useInkset } from "@inkset/react";

const inkset = useInkset({ plugins: [createCodePlugin(), createMathPlugin()] });

// inkset.state
// inkset.containerRef
// inkset.appendToken()
// inkset.endStream()
// inkset.setContent()
```

`useInkset()` is the lower-level hook for custom renderers and imperative integrations. Most apps should start with `<Inkset>`.

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

On resize, Inkset can often reuse pretext's prepared text and rerun layout arithmetic at the new width. Width-sensitive plugins can still do more work when they need to.

## Plugins

Plugins participate in the full pipeline. They transform AST nodes, measure their own dimensions, and render as React components.

```tsx
import { createCodePlugin } from "@inkset/code";
import { createMathPlugin } from "@inkset/math";
import { createTablePlugin } from "@inkset/table";
import { createDiagramPlugin } from "@inkset/diagram";

// Display math via KaTeX
createMathPlugin();

// Shiki with custom theme
createCodePlugin({ theme: "github-light" });

// Mermaid diagrams — claims code blocks where lang === "mermaid",
// other languages still flow through @inkset/code.
createDiagramPlugin({ theme: "neutral" });
```

Writing a custom plugin:

```tsx
const myPlugin: InksetPlugin = {
  name: "custom-chart",
  handles: ["code"],
  canHandle(node) {
    return node.lang === "chart";
  },
  transform(node, ctx) {
    return { ...node, transformedBy: "custom-chart", pluginData: { spec: node.value } };
  },
  measure(node, maxWidth) {
    return { width: maxWidth, height: 300 };
  },
  component: ({ node }) => <MyChart spec={node.pluginData.spec} />,
};
```

## Packages

| Package           | What it does                                            |
| ----------------- | ------------------------------------------------------- |
| `@inkset/core`    | Pipeline engine: ingest, parse, measure, layout         |
| `@inkset/react`   | `<Inkset>` component and lower-level `useInkset()` hook |
| `@inkset/animate` | Reveal primitives: token gate, timelines, shaders       |
| `@inkset/code`    | Shiki syntax highlighting with streaming support        |
| `@inkset/math`    | Display-math rendering for Inkset                       |
| `@inkset/table`   | Responsive tables with horizontal scroll and CSV copy   |
| `@inkset/diagram` | Mermaid diagrams via a lang-scoped code-block plugin    |

## Development

```bash
pnpm install
pnpm test                             # Full monorepo test suite
pnpm --filter @inkset/core test       # Core-only tests
pnpm --filter @inkset/core build      # Build core
pnpm --filter @inkset/playground dev  # Playground at localhost:3333
```

## Status

Early. The core pipeline works, plugins render code and math, the hybrid layout model handles streaming without flicker. Pretext integration falls back to character-width estimates when Canvas isn't available (SSR). The measurement layer is block-type-aware but not pixel-perfect yet for all content types.

See [TODOS.md](./TODOS.md) for what's planned.

## License

MIT
