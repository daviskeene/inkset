# Quick start

`<Inkset>` takes a Markdown string and a `streaming` flag. Give it the message text each time the text grows, and it renders the update without moving the finished text above.

## Render a message

Install the core, the React package, and the code plugin:

```bash
npm install @inkset/core @inkset/react @inkset/code
```

Create the plugin list once, outside your component. Then pass the message text and the streaming state to `<Inkset>`:

```tsx
import { Inkset } from "@inkset/react";
import { createCodePlugin } from "@inkset/code";

const plugins = [createCodePlugin()];

export function Message({ text, streaming }: { text: string; streaming: boolean }) {
  return <Inkset content={text} streaming={streaming} plugins={plugins} />;
}
```

Set `streaming` to `true` while tokens arrive. When the response is complete, set it to `false`, so that Inkset fixes the position of the last block.

To render math, tables, or diagrams, add their plugins to the same list. [Install](/docs/install) shows the packages for each plugin.

## Set the font

Inkset measures text with the font that you give it. Set the font with props, so that the measurement and the screen use the same values:

```tsx
<Inkset content={text} font="Inter, sans-serif" fontSize={16} lineHeight={26} />
```

Inkset applies these props to its CSS too. If you set the font in your own CSS instead, Inkset measures with a different font from the one on the screen, and blocks get the wrong height.
