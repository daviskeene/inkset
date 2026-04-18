# @inkset/math

LaTeX math rendering, inline and block. KaTeX by default; MathJax if you need the broader syntax support.

## Install

```bash
npm install @inkset/math katex
```

## Usage

```tsx
import { createMathPlugin } from "@inkset/math";

<Inkset content={markdown} plugins={[createMathPlugin()]} />;
```

## Delimiters

- `$…$` for inline math.
- `$$…$$` for block math.
- `\(…\)` and `\[…\]` are recognized and normalized to `$` / `$$`.

## Options

| Option         | Type                                | Default    | What it does                             |
| -------------- | ----------------------------------- | ---------- | ---------------------------------------- |
| `renderer`     | `"katex" \| "mathjax"`              | `"katex"`  | Which engine to load.                    |
| `displayAlign` | `"left" \| "center" \| "right"`     | `"center"` | Horizontal alignment for block math.     |
| `errorDisplay` | `"source" \| "message" \| "silent"` | `"source"` | How to show LaTeX that fails to compile. |

## KaTeX vs. MathJax

- **KaTeX** — faster, smaller, covers almost everything you'll see in chat output.
- **MathJax** — slower, larger, handles corner cases KaTeX chokes on (AMS environments, custom macros at render time).

Unless you know you need MathJax, stay with the default.

## Streaming behavior

Math is rendered atomically — either the full expression is visible or the raw source is. If a `$$` is open but the close hasn't arrived, the plugin shows the source as a monospaced code block; as soon as the close appears, the rendered math replaces it.

## See also

- [Writing a plugin](/docs/writing-plugins) — the transform / measure / render contract.
