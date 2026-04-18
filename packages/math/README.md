# @inkset/math

KaTeX- and MathJax-backed math plugin for Inkset.

## Install

```bash
npm install @inkset/math katex
```

Or install `mathjax` if you prefer that renderer.

## Usage

```tsx
import { Inkset } from "@inkset/react";
import { createMathPlugin, createMathJaxRenderer } from "@inkset/math";

const plugins = [createMathPlugin({ renderer: createMathJaxRenderer() })];

export const Example = ({ content }: { content: string }) => {
  return <Inkset content={content} plugins={plugins} />;
};
```

## Options

`createMathPlugin(options?)`:

- `renderer` — `createKaTeXRenderer()` (default) or `createMathJaxRenderer()`.
- `displayAlign` — horizontal alignment for display-mode equations. `"left" | "center" | "right"`. Default `"center"`.
- `errorDisplay` — how parse errors render. `"source"` (raw LaTeX, default), `"message"` (the renderer's error text), or `"hide"`.

## Exports

- `createMathPlugin` (with `MathPluginOptions`, `MathDisplayAlign`, `MathErrorDisplay`)
- `createKaTeXRenderer`, `createMathJaxRenderer` (with `MathRenderer`, `MathRenderOptions`)
