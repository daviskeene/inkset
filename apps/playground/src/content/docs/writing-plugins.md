# Writing a plugin

A plugin gives Inkset three things: a synchronous `transform`, an optional synchronous `measure`, and a React component that renders the enriched node.

## The contract

```ts
interface InksetPlugin {
  name: string;
  key?: string;
  handles: string[];
  canHandle?(node: ASTNode): boolean;
  widthSensitive?: boolean;
  preload?(): Promise<void>;
  transform(node: ASTNode, ctx: PluginContext): EnrichedNode;
  measure?(node: EnrichedNode, maxWidth: number): Dimensions;
  component: React.ComponentType<PluginComponentProps>;
}
```

- `name` — unique plugin name.
- `key` — optional identity key derived from options. Changing it forces a pipeline rebuild.
- `handles` — block types the plugin registers for, such as `"code"` or `"table"`.
- `canHandle` — optional finer-grained claim, for example `lang === "mermaid"` on a code block.
- `widthSensitive` — rerun `transform` on width change.
- `preload` — optional async warmup for heavy dependencies.
- `transform` — synchronous enrichment step. Put parsing and metadata preparation here.
- `measure` — synchronous dimensions for non-text blocks. If omitted, Inkset falls back to text measurement.
- `component` — renders the enriched node.

## A worked example

A plugin that renders `chart` code fences as an inline Vega-Lite chart.

```tsx
import type { InksetPlugin, EnrichedNode } from "@inkset/core";
import { Chart } from "./chart";

export const createChartPlugin = (): InksetPlugin => ({
  name: "chart",
  handles: ["code"],
  canHandle: (node) => node.lang === "chart",

  transform(node) {
    return {
      ...node,
      transformedBy: "chart",
      pluginData: { spec: JSON.parse(node.value) },
    };
  },

  measure(node, maxWidth) {
    return { width: maxWidth, height: 320 };
  },

  component: ({ node }) => <Chart spec={node.pluginData.spec} />,
});
```

## The `measure` contract

`measure` must return synchronously. For async content like syntax highlighting or Mermaid, return a good estimate and let the rendered component call `onContentSettled()` when the real DOM height is ready. The React layer will then re-read and patch the block height.

## Dispatch behavior

- If a `canHandle` plugin claims a node, it runs exclusively.
- If no guarded plugin claims a node, unguarded plugins for that block type chain in registration order.
- Width-sensitive plugins can re-run on resize.

## Registering

Plugins are passed to `<Inkset plugins={...} />`. Instantiate them at module scope so the measurement cache survives renders.

## See also

- [Transform](/docs/transform) — the pipeline stage your plugin plugs into.
- [Measure](/docs/measure) — what happens after `transform` returns.
