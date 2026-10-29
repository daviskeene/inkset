# Migration

Inkset takes a Markdown string and a list of plugins. To move from another renderer, replace the component and its plugins, and then move the spacing rules from your CSS to `blockSpacing`.

## From react-markdown

Before:

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

After:

```tsx
import { Inkset } from "@inkset/react";
import { createCodePlugin } from "@inkset/code";
import { createMathPlugin } from "@inkset/math";
import { createTablePlugin } from "@inkset/table";
import "katex/dist/katex.min.css";

const plugins = [createCodePlugin(), createMathPlugin(), createTablePlugin()];

<Inkset content={content} plugins={plugins} />;
```

Inkset includes GitHub Flavored Markdown, so you do not need a separate GFM plugin. There are also these differences:

- `components` works as it does in react-markdown. An override for code blocks, math, or tables applies only if you do not register the matching plugin. See [Custom elements](/docs/component#custom-elements).
- Inkset does not render raw HTML, and it has no equivalent of `rehype-raw`.

## From Streamdown

`<Streamdown>` and `<Inkset>` take similar inputs. These are the differences:

- **Plugins are an array.** `plugins={{ code, math, mermaid }}` becomes `plugins={[createCodePlugin(), createMathPlugin(), createDiagramPlugin()]}`.
- **Streaming is a boolean.** `mode="streaming"` becomes `streaming={true}`.
- **Content is a prop.** Pass the Markdown as `content`, not as children.
- **`components` has the same shape,** including the `inlineCode` key, so your overrides move over unchanged.
- **Animation moves to `reveal`.** `animated={{ animation: "blurIn", duration: 300, sep: "word" }}` becomes `reveal={{ css: { preset: "blurIn" }, timeline: { durationMs: 300, sep: "word" } }}`.
- **Styles come from Inkset.** Inkset includes its own stylesheet and does not need Tailwind.

## From your own renderer

Replace your message body with `<Inkset content={text} streaming={streaming} />`. Then move your code highlighting, math, and other rich content to the `plugins` array.

To show your own React components between parts of the text, use `InksetParts`. See [Generative UI](/docs/generative-ui).

## Styles

Inkset positions frozen blocks with `position: absolute`, so CSS margins and sibling selectors such as `p + p` and `h2 ~ p` do not change the layout. Use `blockSpacing` for the space between blocks, and use the heading props for heading sizes. See [Theming](/docs/theming).
