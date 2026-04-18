# @inkset/code

Shiki-powered code block plugin for Inkset.

## Install

```bash
npm install @inkset/code shiki
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
- `langs` — explicit list of shiki languages to preload. Falls back to a curated default set.
- `showHeader` — language label + copy button bar. Default `true`.
- `showCopy` — copy button inside the header. Default `true`.
- `showLangLabel` — language badge on the left of the header. Default `true`.
- `wrapLongLines` — wrap long lines instead of horizontal scrolling. Default `false`.

See the repo root for the broader Inkset architecture and playground examples.
