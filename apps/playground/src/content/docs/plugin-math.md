# @inkset/math

`@inkset/math` renders math with KaTeX. It renders display math blocks, such as `$$…$$`, and inline math in a paragraph, such as `$E = mc^2$`.

## Install

```bash
npm install @inkset/math katex
```

Import the KaTeX stylesheet once in your app:

```tsx
import "katex/dist/katex.min.css";
```

## Usage

```tsx
import { createMathPlugin } from "@inkset/math";

const plugins = [createMathPlugin()];

<Inkset content={markdown} plugins={plugins} />;
```

If you do not register the plugin, Inkset shows math as LaTeX source.

## Example

This page uses the math plugin. Inline math stays in the line of text: $E = mc^2$ and $\nabla \cdot \vec{E} = \rho / \varepsilon_0$.

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$

$$
\frac{d}{dx}\left(\int_a^x f(t)\,dt\right)=f(x)
$$

## Options

| Option         | Type                              | Default    | What it does                              |
| -------------- | --------------------------------- | ---------- | ----------------------------------------- |
| `renderer`     | `MathRenderer`                    | KaTeX      | The library that converts LaTeX to HTML.  |
| `displayAlign` | `"left" \| "center" \| "right"`   | `"center"` | The horizontal alignment of display math. |
| `errorDisplay` | `"source" \| "message" \| "hide"` | `"source"` | What to show when the LaTeX has an error. |

To use a different math library, pass a `renderer` object with a `name` and a `renderToString(latex, options)` function that returns HTML.

## Streaming

While a display math block is incomplete, the plugin shows its LaTeX source. When the block is complete, the plugin shows the rendered math.
