# inkset

Rendering infrastructure for streaming AI output. Markdown today, generative UI tomorrow.

Most chat UIs stream tokens into the page and let the browser figure out where things go. That works until the stream gets fast, the response mixes code and math, someone rotates their phone, or the conversation gets long. At that point the DOM becomes part of the problem. The browser recalculates layout for the whole thread on every new token. Lines the user is reading shift under them. Long conversations start to feel heavy. Anything async that mounts into the column forces another pass.

Inkset uses [pretext](https://github.com/chenglou/pretext) to measure text once, then re-layout with arithmetic. Completed blocks do not reflow when new tokens arrive. Resize runs in microseconds because no DOM reads happen on the hot path. The same cost model extends to code, math, tables, Mermaid diagrams, and the generative UI components (json-render, A2UI) arriving in streams.

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

Three shifts in the cost model.

**Layout without reflow.** Pretext measures text via Canvas once. After that, re-layout at a new width is pure arithmetic over cached segment widths. A thousand blocks relayout in under a millisecond, with no DOM reads on the hot path. Good for INP. Good for mobile.

**Stable streaming.** The block currently receiving tokens rides in normal document flow, so the browser handles its height natively. Every block above it is frozen onto absolute coordinates computed by pretext. New tokens do not shift what the user is already reading, because frozen blocks never re-measure.

**Protocol-neutral.** The plugin pipeline handles what async-settling content needs: provisional height, settled height when the content loads, local recompute without disturbing siblings. Code, math, tables, and diagrams ship as plugins. Generative UI components fit the same contract.

The pipeline:

```
Token arrives → Ingest (syntax repair)
             → Parse (remark/rehype per block)
             → Transform (plugins enrich AST)
             → Measure (pretext prepare, cached)
             → Layout (pretext arithmetic)
             → Render (absolute for frozen blocks, flow for the hot block)
```

On resize, Inkset reuses pretext's prepared text and reruns `layout()` at the new width. Width-sensitive plugins can re-transform when they need to. Rich blocks (code, math, diagrams) cache their settled heights per width, so narrower-then-wider resize does not reintroduce jitter.

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

Early but stable. The core pipeline is shipping, plugins cover code (Shiki), math (KaTeX), tables, and Mermaid diagrams. The frozen/hot layout model handles streaming without flicker.

Known gaps worth tracking:

- **SSR.** Falls back to a character-width estimate when Canvas isn't available in Node, which produces one layout shift on hydration. A proper story needs pretext's `setMeasureContext` API or a node-canvas polyfill.
- **Selection across absolute blocks.** Browser-native find-in-page works block-by-block, but selecting across frozen blocks needs a custom selection layer. On the roadmap.
- **Framework adapters.** React only today. The core is framework-agnostic by design. Vue and Svelte adapters are planned.
- **Generative UI plugin.** `@inkset/generative` for json-render and A2UI schemas is planned as a reference implementation.
- **Web Worker pipeline.** The parse/measure/layout stages have no DOM dependencies. Moving them off the main thread is a near-term goal.

See [TODOS.md](./TODOS.md) for the full list.

## License

MIT
