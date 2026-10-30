# @inkset/code

Shiki-powered code block plugin for Inkset.

## Install

```bash
npm install @inkset/code
```

## Usage

```tsx
import { Inkset } from "@inkset/react";
import { createCodePlugin } from "@inkset/code";

const plugins = [createCodePlugin({ theme: "github-dark" })];

export const Example = ({ content }: { content: string }) => {
  return <Inkset content={content} plugins={plugins} />;
};
```

## Options

- `theme` — primary (dark-mode) shiki theme. Default `"github-dark"`.
- `lightTheme` — companion theme rendered under `@media (prefers-color-scheme: light)`.
- `langs` — grammars to load during `preload()`. Every other language shiki bundles loads the first time a block uses it; unknown names render as plain text.
- `showHeader` — language label + copy button bar. Default `true`.
- `showCopy` — copy button inside the header. Default `true`.
- `showLangLabel` — language badge on the left of the header. Default `true`.
- `wrapLongLines` — wrap long lines instead of horizontal scrolling. Default `false`.

While a block streams, only the lines that completed since the last update (and the line still being written) are tokenized; the rest of the block's highlighting is reused.

See the repo root for the broader Inkset architecture and playground examples.
