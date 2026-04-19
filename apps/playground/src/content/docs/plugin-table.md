# @inkset/table

Responsive markdown tables with horizontal scroll on narrow viewports and a CSV copy action.

## Install

```bash
npm install @inkset/table
```

## Usage

```tsx
import { createTablePlugin } from "@inkset/table";

<Inkset content={markdown} plugins={[createTablePlugin()]} />;
```

## Options

| Option         | Type                              | Default        | What it does                                    |
| -------------- | --------------------------------- | -------------- | ----------------------------------------------- |
| `showCopy`     | `boolean`                         | `true`         | Show the copy-as-CSV action in the header.      |
| `borderStyle`  | `"all" \| "horizontal" \| "none"` | `"horizontal"` | Which borders to draw.                          |
| `zebra`        | `boolean`                         | `false`        | Zebra-stripe alternate rows.                    |
| `stickyHeader` | `boolean`                         | `false`        | Keep the header visible while the body scrolls. |

## Behavior

The plugin renders tables inside a horizontal scroll container. Cells stay on one line and the container handles overflow when the table is wider than the viewport.

## Why not just markdown's default table?

Because the default table has no useful mobile policy. On a narrow viewport, long cells either wrap into an unreadable mess or push the document wider than the container. Inkset makes the overflow behavior explicit and keeps copy/export support in the same block.

## See also

- [Measure](/docs/measure) — how the plugin reports its dimensions to the layout engine.
