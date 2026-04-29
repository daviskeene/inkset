# @inkset/math

Display-math rendering for Inkset. The documented path today is KaTeX.

## Install

```bash
npm install @inkset/math katex
```

If you use the default KaTeX renderer, also import the stylesheet somewhere in your app:

```tsx
import "katex/dist/katex.min.css";
```

## Usage

```tsx
import { createMathPlugin } from "@inkset/math";

<Inkset content={markdown} plugins={[createMathPlugin()]} />;
```

## What it handles

The plugin claims display-math blocks such as `$$...$$`.

Inline math still works in the React renderer, but it is not claimed as a block by the plugin contract.

## Example

Inline math stays in prose: $E = mc^2$ and $\nabla \cdot \vec{E} = \rho / \varepsilon_0$.

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$

$$
\frac{d}{dx}\left(\int_a^x f(t)\,dt\right)=f(x)
$$

## Options

| Option         | Type                              | Default    | What it does                                  |
| -------------- | --------------------------------- | ---------- | --------------------------------------------- |
| `renderer`     | `MathRenderer`                    | KaTeX      | Renderer abstraction used for display blocks. |
| `displayAlign` | `"left" \| "center" \| "right"`   | `"center"` | Horizontal alignment for display equations.   |
| `errorDisplay` | `"source" \| "message" \| "hide"` | `"source"` | How parse errors are shown.                   |

## Streaming behavior

While a display-math block is still incomplete, Inkset keeps showing the raw source. Once the block settles, the rendered output replaces it.

## See also

- [Theming](/docs/theming) — styling the rendered output.
- [Writing a plugin](/docs/writing-plugins) — the plugin contract this package follows.
