# @inkset/math

Display-math plugin for Inkset.

## Install

```bash
npm install @inkset/math katex
```

If you use the default KaTeX renderer, also import its stylesheet somewhere in your app:

```tsx
import "katex/dist/katex.min.css";
```

## Usage

```tsx
import { Inkset } from "@inkset/react";
import { createMathPlugin } from "@inkset/math";
import "katex/dist/katex.min.css";

const plugins = [createMathPlugin()];

export const Example = ({ content }: { content: string }) => {
  return <Inkset content={content} plugins={plugins} />;
};
```

`@inkset/math` claims display-math blocks such as `$$...$$` and renders them inside Inkset's layout pipeline.

## Options

`createMathPlugin(options?)`:

- `renderer` — renderer abstraction for display blocks. The documented path today is KaTeX.
- `displayAlign` — horizontal alignment for display-mode equations. `"left" | "center" | "right"`. Default `"center"`.
- `errorDisplay` — how parse errors render. `"source"` (raw LaTeX, default), `"message"` (the renderer's error text), or `"hide"`.

## Exports

- `createMathPlugin` (with `MathPluginOptions`, `MathDisplayAlign`, `MathErrorDisplay`)
- `createKaTeXRenderer`, `createMathJaxRenderer` (with `MathRenderer`, `MathRenderOptions`)
