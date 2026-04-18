# @inkset/table

Responsive markdown table plugin for Inkset.

## Install

```bash
npm install @inkset/table
```

## Usage

```tsx
import { Inkset } from "@inkset/react";
import { createTablePlugin } from "@inkset/table";

const plugins = [createTablePlugin({ zebra: true, showCopy: true })];

export const Example = ({ content }: { content: string }) => {
  return <Inkset content={content} plugins={plugins} />;
};
```

## Options

- `showCopy` — show the CSV copy button in the table header bar. Default `true`.
- `borderStyle` — `"all"` (full grid), `"horizontal"` (row dividers only, default), or `"none"`.
- `zebra` — alternate row backgrounds via `--inkset-table-zebra-bg`. Default `false`.
- `stickyHeader` — pin `<thead>` while the table scrolls vertically. Default `false`. Only meaningful inside a height-clipped container.
