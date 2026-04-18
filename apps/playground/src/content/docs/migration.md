# Migration

How to move to Inkset from the common markdown renderers.

## From `react-markdown`

**Before:**

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";

<ReactMarkdown
  remarkPlugins={[remarkGfm, remarkMath]}
  rehypePlugins={[rehypeKatex, rehypeHighlight]}
>
  {content}
</ReactMarkdown>;
```

**After:**

```tsx
import { Inkset } from "@inkset/react";
import { createCodePlugin } from "@inkset/code";
import { createMathPlugin } from "@inkset/math";
import { createTablePlugin } from "@inkset/table";
import "katex/dist/katex.min.css";

const plugins = [createCodePlugin(), createMathPlugin(), createTablePlugin()];

<Inkset content={content} plugins={plugins} />;
```

The shape is similar, but Inkset takes the full markdown string and orchestrates the pipeline itself — you don't wire remark / rehype plugins separately.

## From `streamdown`

Streamdown's `<Streamdown>` and Inkset's `<Inkset>` are nearly-swappable for streaming markdown. The main differences:

- **No Tailwind requirement.** Streamdown ships Tailwind classes; Inkset ships CSS custom properties. If you're not using Tailwind, this is a net reduction.
- **`plugins` is an array, not an object.** Streamdown's `plugins={{ code, math, mermaid }}` becomes `plugins={[createCodePlugin(), createMathPlugin(), createDiagramPlugin()]}`.
- **`mode="streaming"` is `streaming={true}`.**

## From a hand-rolled chat renderer

If you've built your own markdown renderer for your chat app and you're here because it's flickering under fast streams, the one-line upgrade is to wrap your message body in `<Inkset content={text} streaming={streaming} />` and move your plugins (code highlighting, math, etc.) into the plugin array.

If you're doing anything exotic — rendering a custom block type, injecting inline React components between paragraphs, reacting to the layout pass — see [Writing a plugin](/docs/writing-plugins).

## What will need changing in your styles

Inkset renders frozen blocks with `position: absolute`, which means sibling-selector CSS (`p + p`, `h2 ~ p`) won't match the way it used to. The equivalents are block margin props (`blockMargin`) and the heading tuples (`headingSizes`, `headingWeights`). See [Theming](/docs/theming).

## See also

- [Benchmarks](/docs/benchmarks) — what you're getting out of the switch.
