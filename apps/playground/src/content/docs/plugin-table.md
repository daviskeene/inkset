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

The table overflows horizontally when its natural width exceeds the container. The plugin measures the content against the font you configured on `<Inkset>` and decides whether to wrap a cell's contents or scroll the whole table.

## Why not just markdown's default table?

Because the default table has no width policy. On a narrow viewport, long cells either wrap into an unreadable mess or push the whole document wider than the container. This plugin does the measurement and picks the right behavior per column.

## See also

- [Measure](/docs/measure) — how the plugin reports its dimensions to the layout engine.
