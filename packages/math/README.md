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

## Exports

- `createMathPlugin`
- `createKaTeXRenderer`
- `createMathJaxRenderer`
