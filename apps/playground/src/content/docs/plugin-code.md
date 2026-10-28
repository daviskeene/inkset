# @inkset/code

`@inkset/code` highlights code blocks with [Shiki](https://shiki.style). It highlights code while the code streams, before the code fence closes.

## Install

```bash
npm install @inkset/code
```

## Usage

```tsx
import { Inkset } from "@inkset/react";
import { createCodePlugin } from "@inkset/code";

const plugins = [createCodePlugin({ theme: "github-dark" })];

export function Message({ text, streaming }: { text: string; streaming: boolean }) {
  return <Inkset content={text} streaming={streaming} plugins={plugins} />;
}
```

## Options

| Option          | Type       | Default         | What it does                                                    |
| --------------- | ---------- | --------------- | --------------------------------------------------------------- |
| `theme`         | `string`   | `"github-dark"` | The Shiki theme.                                                |
| `lightTheme`    | `string`   | None            | A second Shiki theme for a light color scheme.                  |
| `langs`         | `string[]` | `[]`            | More Shiki languages to load, in addition to the default set.   |
| `showHeader`    | `boolean`  | `true`          | Shows the bar above the code with the language and copy button. |
| `showCopy`      | `boolean`  | `true`          | Shows the copy button.                                          |
| `showLangLabel` | `boolean`  | `true`          | Shows the language name.                                        |
| `wrapLongLines` | `boolean`  | `false`         | Wraps long lines. By default, long lines scroll horizontally.   |

## Languages

The plugin loads a default set of common languages, such as JavaScript, TypeScript, Python, Rust, Go, and Java. To highlight other languages, add their Shiki names to `langs`. A code block in a language that is not loaded shows as plain text.

## Streaming

While a code block streams, it shows a streaming indicator. The plugin highlights the partial code before the code fence closes, and it highlights the code again when more code arrives.

## Light and dark themes

Set `theme` and `lightTheme` to highlight the code in both themes. The plugin renders both versions. CSS shows the `lightTheme` version when the system uses a light color scheme (`prefers-color-scheme: light`), and the `theme` version at all other times. Because both versions are already on the page, a change of color scheme does not need new highlighting.
