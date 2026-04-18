# @inkset/code

Syntax-highlighted code blocks via [Shiki](https://shiki.style). Supports streaming — tokens that arrive after Shiki has loaded re-highlight the hot block without flashing.

## Install

```bash
npm install @inkset/code
```

## Usage

```tsx
import { createCodePlugin } from "@inkset/code";

const codePlugin = createCodePlugin({
  theme: "github-dark",
});

<Inkset content={markdown} plugins={[codePlugin]} />;
```

## Options

| Option          | Type       | Default         | What it does                                            |
| --------------- | ---------- | --------------- | ------------------------------------------------------- |
| `theme`         | `string`   | `"github-dark"` | Shiki theme name for the primary rendering.             |
| `lightTheme`    | `string`   | same as `theme` | Optional second theme used when dual-theme mode is on.  |
| `langs`         | `string[]` | on-demand       | Pre-load these languages at module init time.           |
| `showHeader`    | `boolean`  | `true`          | Show the language label + copy button strip.            |
| `showCopy`      | `boolean`  | `true`          | Show the copy-to-clipboard action.                      |
| `showLangLabel` | `boolean`  | `true`          | Show the language label.                                |
| `wrapLongLines` | `boolean`  | `false`         | Wrap lines at the container width instead of scrolling. |

## Streaming behavior

While a code fence is open, the plugin displays the raw source in a muted state with a trailing `…` so you can tell the block is still arriving. As soon as the closing fence appears, Shiki highlights it and the block freezes.

## Dual-theme mode

Pass `theme` and `lightTheme` to render both, and let CSS pick which one shows based on the user's theme. This avoids re-highlighting on theme swap, which would otherwise be a measurable jank.

## See also

- [Theming](/docs/theming) — wiring Shiki's colors to your page palette.
- [Writing a plugin](/docs/writing-plugins) — if you're building something similar.
