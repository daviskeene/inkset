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

- `showCopy`
- `borderStyle`
- `zebra`
- `stickyHeader`
