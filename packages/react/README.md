# @inkset/react

React bindings for Inkset, including the `Inkset` component and `useInkset()` hook.

## Install

```bash
npm install @inkset/react @inkset/core
```

## Usage

```tsx
import { Inkset } from "@inkset/react";
import { createCodePlugin } from "@inkset/code";
import { createMathPlugin } from "@inkset/math";

const plugins = [createCodePlugin(), createMathPlugin()];

export const ChatMessage = ({ content, streaming }: { content: string; streaming: boolean }) => {
  return <Inkset content={content} streaming={streaming} plugins={plugins} />;
};
```

## Also exported

- `useInkset`
- `createShaderRegistry`
- `defaultShaderRegistry`

See the repo root README for a fuller overview of the layout model and plugin system.
