# Writing a plugin

A plugin tells Inkset how to render one type of block. It has a synchronous `transform` function, an optional synchronous `measure` function, and a React component that renders the block.

## The plugin interface

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

| Field            | What it does                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `name`           | A unique name for the plugin.                                                                 |
| `key`            | An identity for the plugin's options. When it changes, Inkset builds a new pipeline.          |
| `handles`        | The block types that the plugin handles, such as `"code"` or `"table"`.                       |
| `canHandle`      | Claims only some blocks of a type. For example, it can return `true` only for `mermaid` code. |
| `widthSensitive` | Set to `true` to run `transform` again when the width changes.                                |
| `preload`        | Loads large dependencies. Inkset waits for it before the first render.                        |
| `transform`      | Adds the data that the component needs to `pluginData`. It must return immediately.           |
| `measure`        | Returns the size of the block. If you do not supply it, Inkset measures the block as text.    |
| `component`      | Renders the block.                                                                            |

[Transform](/docs/transform) explains the order in which plugins run.

## Example

This plugin renders code blocks in the `chart` language as charts. The `Chart` component is your own.

```tsx
import type { InksetPlugin } from "@inkset/core";
import { Chart } from "./chart";

const parseSpec = (source: string): unknown => {
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
};

export const createChartPlugin = (): InksetPlugin => ({
  name: "chart",
  handles: ["code"],
  canHandle: (node) => node.lang === "chart",

  transform: (node) => ({
    ...node,
    transformedBy: "chart",
    pluginData: { spec: parseSpec(node.value ?? "") },
  }),

  measure: (_node, maxWidth) => ({ width: maxWidth, height: 320 }),

  component: ({ node, onContentSettled }) => {
    const spec = node.pluginData?.spec;
    if (!spec) return <pre>{node.value}</pre>;
    return <Chart spec={spec} onRender={onContentSettled} />;
  },
});
```

While the code block streams, its JSON is incomplete, so `parseSpec` returns `null` and the component shows the source. When the JSON is complete, the component shows the chart.

## Measurement

`measure` must return a result immediately. For content that renders later, such as a chart or a diagram, return a good estimate. When the content is on the screen, call `onContentSettled()`. Inkset then reads the real height of the block from the DOM and updates the layout.

Until a plugin calls `onContentSettled()`, Inkset lets the DOM make the block taller, but not shorter. This prevents a short placeholder from removing the space that the estimate reserved. If your component renders immediately, call `onContentSettled()` when it mounts, so that Inkset can also make the block shorter than the estimate.

## Register the plugin

Pass the plugin in the `plugins` prop. Create the plugin list once, outside your component:

```tsx
const plugins = [createChartPlugin()];

<Inkset content={text} plugins={plugins} />;
```

Inkset compares plugins by `name` and `key`. If your plugin takes options that change its output, make `key` from the options, so that a change of options builds a new pipeline.
