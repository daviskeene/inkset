# @inkset/table

`@inkset/table` renders Markdown tables in a container that scrolls horizontally when the table is wider than the message. It also adds a button that copies the table as CSV.

## Install

```bash
npm install @inkset/table
```

## Usage

```tsx
import { createTablePlugin } from "@inkset/table";

const plugins = [createTablePlugin()];

<Inkset content={markdown} plugins={plugins} />;
```

## Example

This page uses the table plugin:

| Plugin            | Blocks that it claims    | What it renders                |
| ----------------- | ------------------------ | ------------------------------ |
| `@inkset/code`    | Code blocks              | Highlighted code with copy     |
| `@inkset/math`    | Display math blocks      | Math from KaTeX                |
| `@inkset/diagram` | Code blocks in `mermaid` | SVG diagrams                   |
| `@inkset/table`   | Markdown tables          | Scrolling tables with CSV copy |

## Options

| Option         | Type                              | Default        | What it does                                              |
| -------------- | --------------------------------- | -------------- | --------------------------------------------------------- |
| `showCopy`     | `boolean`                         | `true`         | Shows the button that copies the table as CSV.            |
| `borderStyle`  | `"all" \| "horizontal" \| "none"` | `"horizontal"` | Which borders to show.                                    |
| `zebra`        | `boolean`                         | `false`        | Gives every second row a different background.            |
| `stickyHeader` | `boolean`                         | `false`        | Keeps the header row visible when the table body scrolls. |

`stickyHeader` has an effect only when a parent element limits the height of the table.

## Wide tables

Cells stay on one line. When a table is wider than the container, the container scrolls horizontally. On a narrow screen, this keeps each row on one line and keeps the table inside the message.
