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

- `useInkset` — the underlying hook (plus `UseInksetOptions` / `UseInksetResult`)
- `InksetProps` — prop types for `<Inkset>`
- `themeToCssVars` — compile an `InksetTheme` object into `--inkset-*` CSS variables (plus `InksetTheme`, `HeadingTuple`, `InksetCssVars`)
- `createShaderRegistry`, `defaultShaderRegistry` — re-exported from `@inkset/animate` for custom reveal shaders
- Reveal config types re-exported from `@inkset/animate`: `RevealProp`, `ThrottleOptions`, `TimelineOptions`, `CssRevealOptions`, `ShaderConfig`, `ShaderRegistry`, etc.

See the repo root README for a fuller overview of the layout model and plugin system.
