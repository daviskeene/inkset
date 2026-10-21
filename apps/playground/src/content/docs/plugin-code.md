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

## Example

```tsx
import { Inkset } from "@inkset/react";
import { createCodePlugin } from "@inkset/code";

const plugins = [createCodePlugin({ theme: "github-dark" })];

export function Message({ text, streaming }: { text: string; streaming: boolean }) {
  return <Inkset content={text} streaming={streaming} plugins={plugins} />;
}
```

## Options

| Option          | Type       | Default         | What it does                                            |
| --------------- | ---------- | --------------- | ------------------------------------------------------- |
| `theme`         | `string`   | `"github-dark"` | Shiki theme name for the primary rendering.             |
| `lightTheme`    | `string`   | same as `theme` | Optional second theme used when dual-theme mode is on.  |
| `langs`         | `string[]` | `[]`            | Grammars to load during `preload()`.                    |
| `showHeader`    | `boolean`  | `true`          | Show the language label + copy button strip.            |
| `showCopy`      | `boolean`  | `true`          | Show the copy-to-clipboard action.                      |
| `showLangLabel` | `boolean`  | `true`          | Show the language label.                                |
| `wrapLongLines` | `boolean`  | `false`         | Wrap lines at the container width instead of scrolling. |

## Streaming behavior

While a code fence is still streaming, the block keeps its streaming indicator visible. Once Shiki is ready, partial code is highlighted on every update, before the fence closes.

Highlighting is incremental: lines that have finished are tokenized once and cached together with Shiki's grammar state, so an update only tokenizes the lines completed since the last one plus the line still being written. A long block costs about the same per update as a short one, and the output matches a full `codeToHtml` pass exactly.

## Languages

Grammars load on demand: the first block in a language fetches its grammar, and later blocks reuse it. Any language Shiki bundles works without configuration. Pass `langs` to fetch specific grammars during `preload()` so their first block highlights without waiting. Fences in a language Shiki doesn't know render as plain text.

## Dual-theme mode

Pass `theme` and `lightTheme` to render both, and let CSS pick which one shows based on the user's theme. This avoids re-highlighting on theme swap, which would otherwise be a measurable jank.

## See also

- [Theming](/docs/theming) — wiring Shiki's colors to your page palette.
- [Writing a plugin](/docs/writing-plugins) — if you're building something similar.
