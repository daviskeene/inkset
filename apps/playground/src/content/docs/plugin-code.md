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
| `langs`         | `string[]` | `[]`            | Shiki languages to load with the highlighter, in `preload()`.   |
| `showHeader`    | `boolean`  | `true`          | Shows the bar above the code with the language and copy button. |
| `showCopy`      | `boolean`  | `true`          | Shows the copy button.                                          |
| `showLangLabel` | `boolean`  | `true`          | Shows the language name.                                        |
| `wrapLongLines` | `boolean`  | `false`         | Wraps long lines. By default, long lines scroll horizontally.   |

## Languages

The plugin loads the grammar for a language when the first code block in that language appears. Later code blocks in the same language use the same grammar. All of the languages that Shiki includes work without configuration. To load grammars earlier, add their Shiki names to `langs`, and the plugin loads them with the highlighter. A code block in a language that Shiki does not include shows as plain text.

## Streaming

While a code block streams, it shows a streaming indicator. The plugin highlights the partial code before the code fence closes, and it highlights the code again when more code arrives.

The plugin keeps the highlighting of each completed line. When more code arrives, it highlights only the new lines and the line that is still incomplete. Thus, each update of a long code block costs approximately the same as each update of a short one. The result is the same as when Shiki highlights all of the code at once.

## Light and dark themes

Set `theme` and `lightTheme` to highlight the code in both themes. The plugin renders both versions. CSS shows the `lightTheme` version when the system uses a light color scheme (`prefers-color-scheme: light`), and the `theme` version at all other times. Because both versions are already on the page, a change of color scheme does not need new highlighting.
