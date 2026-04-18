# Writing a plugin

A plugin is three small functions: `transform` to enrich the AST, `measure` to report dimensions, and a React component to render the block. None of them are required — the simplest plugin just provides a component.

## The contract

```ts
interface InksetPlugin {
  name: string;
  handles: string[];
  transform?(node: ASTNode, ctx: PluginContext): EnrichedNode | Promise<EnrichedNode>;
  measure?(node: EnrichedNode, maxWidth: number): Dimensions;
  component?: React.ComponentType<BlockProps>;
}
```

- `name` — for debugging; must be unique across registered plugins.
- `handles` — AST node types this plugin claims. Common values: `"code"`, `"math"`, `"table"`, `"custom-block"`.
- `transform` — enrich the node with data the component will need at render time. Heavy work goes here.
- `measure` — return the block's rendered dimensions. Called for every layout pass.
- `component` — renders the enriched node.

## A worked example

A plugin that renders `chart` code fences as an inline Vega-Lite chart.

```tsx
import type { InksetPlugin, EnrichedNode } from "@inkset/core";
import { Chart } from "./chart";

export const createChartPlugin = (): InksetPlugin => ({
  name: "chart",
  handles: ["code"],

  transform(node) {
    if (node.lang !== "chart") return node;
    return {
      ...node,
      transformedBy: "chart",
      pluginData: { spec: JSON.parse(node.value) },
    };
  },

  measure(node, maxWidth) {
    if (node.transformedBy !== "chart") return null;
    return { width: maxWidth, height: 320 };
  },

  component: ({ node }) => <Chart spec={node.pluginData.spec} />,
});
```

## The `measure` contract

`measure` must return synchronously. If your content is async (Shiki, Mermaid, a network-backed chart), return a placeholder dimension and let the content patch itself once it settles. The layout engine re-measures on settle; see how `@inkset/code` and `@inkset/diagram` do it.

## Handling state transitions

- **Block opens** — `transform` receives a node with `isPartial: true`.
- **Block completes** — `transform` runs again without the partial flag.
- **Block updates mid-stream** — only the hot block re-runs; frozen blocks don't call `transform` again.

## Registering

Plugins are passed to `<Inkset plugins={...} />`. Instantiate them at module scope so the measurement cache survives renders.

## See also

- [Transform](/docs/transform) — the pipeline stage your plugin plugs into.
- [Measure](/docs/measure) — what happens after `transform` returns.
