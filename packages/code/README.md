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

- `theme`
- `lightTheme`
- `showHeader`
- `showCopy`
- `showLangLabel`
- `wrapLongLines`

See the repo root for the broader Inkset architecture and playground examples.
