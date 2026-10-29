---
name: inkset
description: Install and configure Inkset, a React renderer for streaming LLM output, in a new or existing project. Use when a user wants to render chat or AI answers with Inkset, replace react-markdown or Streamdown with Inkset, or show generative UI components between Markdown parts.
---

# Set up Inkset

These instructions tell a coding agent how to add Inkset to a React project, or how to move a project from another Markdown renderer to Inkset. Inkset renders Markdown that a language model streams, and its plugins render code, math, tables, and Mermaid diagrams. The full documentation is at https://inkset.dev/llms.txt, and each docs page is also available as Markdown at its URL plus `.md`.

Do the steps in order. Tell the user about each decision that changes how their app looks or behaves.

## 1. Examine the project

Find these facts before you change files:

- **React version.** Inkset needs React 18 or 19. Read `react` in `package.json`.
- **Package manager.** Use the lockfile: `pnpm-lock.yaml` for pnpm, `yarn.lock` for Yarn, `bun.lock` or `bun.lockb` for Bun, and `package-lock.json` for npm. In a monorepo, install in the package of the app that renders the messages.
- **Framework.** In the Next.js App Router, `<Inkset>` must render inside a Client Component, because it uses React hooks.
- **The current renderer.** Search for `react-markdown`, `streamdown`, `marked`, `markdown-it`, `remark`, and `dangerouslySetInnerHTML`. Note each place that renders model output.
- **Plugins.** Note the remark and rehype plugins, syntax highlighters, KaTeX, and Mermaid that the current renderer uses.
- **Styles.** Note Tailwind Typography (`prose` classes), the Tailwind version, and global CSS rules for elements such as `h1`, `p`, `ul`, `pre`, and `code`.
- **Fonts.** Find the font family, font size, and line height of the message text. In Next.js, look for `next/font`.
- **Streaming.** Find how tokens arrive: the AI SDK `useChat` hook, `fetch` with a stream, a WebSocket, or a store.

Replace only the renderers that show model output. Keep the renderers for static content, such as blog posts and CMS pages, unless the user asks you to change them. Inkset renders content only in the browser, so a page that needs server-rendered HTML for search engines must keep its current renderer.

## 2. Install the packages

Install the core and the React package with the project's package manager:

```bash
npm install @inkset/core @inkset/react
```

Then install a plugin for each type of content that the model sends. Match the features of the current renderer. For a new project, start with the code and table plugins.

| Content          | Package           | Also install |
| ---------------- | ----------------- | ------------ |
| Code blocks      | `@inkset/code`    | Nothing      |
| Math             | `@inkset/math`    | `katex`      |
| Tables           | `@inkset/table`   | Nothing      |
| Mermaid diagrams | `@inkset/diagram` | `mermaid`    |

Install the diagram plugin if the app shows Mermaid diagrams. Mermaid is large, but the plugin downloads it only when a message contains a Mermaid block.

If you install the math plugin, import the KaTeX stylesheet once, in the root layout or the entry file:

```ts
import "katex/dist/katex.min.css";
```

After you replace all uses of the old renderer, remove the packages that only it used, such as `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, `rehype-highlight`, `streamdown`, and `@streamdown/*`. Keep `katex` if the math plugin uses it.

## 3. Create the plugin list

Create the plugins once, in their own module, so that all messages share them:

```ts
// lib/inkset.ts
import { createCodePlugin } from "@inkset/code";
import { createTablePlugin } from "@inkset/table";

export const inksetPlugins = [createCodePlugin(), createTablePlugin()];
```

Do not create plugins inside a component's render function.

## 4. Render the messages

Pass the Markdown of each message as `content`. Set `streaming` to `true` only for the message that receives tokens, and set it to `false` when the response is complete.

With the AI SDK `useChat` hook, the last message streams while `status` is `"streaming"`. Render the text of each message with a small Client Component:

```tsx
"use client";

import type { UIMessage } from "ai";
import { Inkset } from "@inkset/react";
import { inksetPlugins } from "@/lib/inkset";

export function MessageText({ message, streaming }: { message: UIMessage; streaming: boolean }) {
  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
  return <Inkset content={text} streaming={streaming} plugins={inksetPlugins} />;
}
```

```tsx
{
  messages.map((message, index) => (
    <MessageText
      key={message.id}
      message={message}
      streaming={status === "streaming" && index === messages.length - 1}
    />
  ));
}
```

For other token sources, keep the text in React state and add each chunk to it. See https://inkset.dev/docs/streaming.md.

If messages sit in a container that sizes itself to its content, such as a user message bubble with `max-width` and no `width`, add the `flow` prop to that `<Inkset>`. Inkset needs a definite width for its measured layout, and `flow` lets the browser size the bubble from the text.

In the Next.js App Router, put the code that renders `<Inkset>` in a file that starts with `"use client"`. If a Server Component rendered the old renderer, move the render into a small Client Component and pass the text to it as a prop.

## 5. Match the typography

Inkset measures text before it renders it, so the values that it measures with must match the CSS on the screen. If they do not match, blocks overlap or have gaps.

1. Pass the font family, font size, and line height of the message text as props. `fontSize` and `lineHeight` are in pixels.

   ```tsx
   <Inkset content={text} font='"Inter", sans-serif' fontSize={16} lineHeight={26} />
   ```

   With `next/font`, pass `font={inter.style.fontFamily}`. Use a named font. Do not use `system-ui` alone, because Canvas can measure it with a different font from the one that the browser shows.

2. Do not set font properties in CSS for elements inside Inkset. Inkset applies the props to its CSS.

3. Remove Tailwind Typography `prose` classes from the elements that contain `<Inkset>`. These classes add margins and font sizes that Inkset does not measure.

4. Check the global CSS for rules on elements, such as `h1 { font-size: … }` or `ul { padding: 0 }`. Inkset's default styles use `:where()`, so they have zero specificity, and these rules override them. Exclude the message area from such rules, or restore Inkset's values with rules that have a higher specificity.

   Tailwind v3's preflight is a common example. It sets headings to the body font size and removes list padding and bullets. In a Tailwind v3 project, add this CSS. Tailwind v4 puts its preflight in a cascade layer, so it does not need this CSS.

   ```css
   .inkset-root h1 {
     font-size: var(--inkset-heading-1-size);
     font-weight: var(--inkset-heading-1-weight);
   }
   .inkset-root h2 {
     font-size: var(--inkset-heading-2-size);
     font-weight: var(--inkset-heading-2-weight);
   }
   .inkset-root h3 {
     font-size: var(--inkset-heading-3-size);
     font-weight: var(--inkset-heading-3-weight);
   }
   .inkset-root :is(h4, h5, h6) {
     font-size: var(--inkset-heading-4-size);
     font-weight: var(--inkset-heading-4-weight);
   }
   .inkset-root :is(ul, ol) {
     padding-left: var(--inkset-list-indent);
   }
   .inkset-root ul {
     list-style: disc;
   }
   .inkset-root ol {
     list-style: decimal;
   }
   ```

5. To change heading sizes, use the `headingSizes`, `headingWeights`, and `headingLineHeights` props, not CSS. If `components` overrides set font sizes or margins with classes, move those values to these props and to `blockSpacing`.

6. Set the space between blocks with the `blockSpacing` prop, not with CSS margins. See https://inkset.dev/docs/theming.md.

## 6. Match the colors

Pass the app's colors with the `theme` prop. A value can be a `var()` reference to the app's own CSS variables, so Inkset follows the app's light and dark modes:

```tsx
const theme = {
  colors: { text: "var(--foreground)", textMuted: "var(--muted-foreground)" },
};

<Inkset content={text} theme={theme} plugins={inksetPlugins} />;
```

The code plugin takes Shiki themes. `createCodePlugin({ theme: "github-dark", lightTheme: "github-light" })` follows the system color scheme only. If the app has its own dark mode switch, create one code plugin for each mode, and pass the plugin list that matches the current mode.

## 7. Move from react-markdown

| react-markdown                                                         | Inkset                                                                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `<ReactMarkdown>{text}</ReactMarkdown>`                                | `<Inkset content={text} />`                                                                                        |
| `remark-gfm`                                                           | Built in. Remove it.                                                                                               |
| `remark-math` and `rehype-katex`                                       | `createMathPlugin()` and the KaTeX stylesheet                                                                      |
| `rehype-highlight`, `rehype-pretty-code`, or a custom `code` component | `createCodePlugin()`                                                                                               |
| A `code` component that renders Mermaid                                | `createDiagramPlugin()`                                                                                            |
| A `components.a` override that only sets `target` or `rel`             | `linkAttrs`. See https://inkset.dev/docs/component.md#links.                                                       |
| `rehype-raw`                                                           | No equivalent. Inkset does not render raw HTML.                                                                    |
| Other `components` overrides                                           | `components`, with the same shape. An override for a block that a plugin renders applies only without that plugin. |

## 8. Move from Streamdown

| Streamdown                                                                    | Inkset                                                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `<Streamdown>{text}</Streamdown>`                                             | `<Inkset content={text} />`                                                          |
| `mode="streaming"` or `isAnimating={…}`                                       | `streaming={…}`                                                                      |
| `plugins={{ code, math, mermaid }}`                                           | `plugins={[createCodePlugin(), createMathPlugin(), createDiagramPlugin()]}`          |
| `shikiTheme={[light, dark]}`                                                  | `createCodePlugin({ theme: dark, lightTheme: light })`                               |
| `controls={false}`                                                            | `showHeader: false` or `showCopy: false` in the plugin options                       |
| `components`, including `inlineCode`                                          | `components`, with the same shape                                                    |
| `animated={{ animation: "blurIn", duration: 300, sep: "word" }}`              | `reveal={{ css: { preset: "blurIn" }, timeline: { durationMs: 300, sep: "word" } }}` |
| `createMermaidPlugin({ config })`                                             | `createDiagramPlugin({ config })`                                                    |
| `import "streamdown/styles.css"` and a Tailwind `@source` line for Streamdown | Remove them. Inkset includes its own stylesheet.                                     |

## 9. Components between the text

Do this step only if the assistant messages contain UI, such as tool results that render as components. Use `InksetParts`. It renders Markdown parts with Inkset and your components between them, in normal document flow:

```tsx
import { InksetParts } from "@inkset/react";

<InksetParts
  parts={parts}
  renderSurface={(part) => <ToolResult id={part.id} data={part.data} />}
  plugins={inksetPlugins}
/>;
```

Each part needs an `id` that does not change while the message updates. See https://inkset.dev/docs/generative-ui.md.

## 10. Verify the setup

1. Run the type checker and the build.
2. Run the app, and show a response that contains each type of content that you installed a plugin for. You can stream this sample, or pass it as `content`:

   ````md
   ## A heading

   A paragraph with **bold** text, `inline code`, and a [link](https://inkset.dev).

   - A list item
   - Another list item

   ```ts
   const answer = 42;
   ```

   | Name | Value |
   | ---- | ----- |
   | a    | 1     |

   $$
   E = mc^2
   $$
   ````

3. Check these items:
   - Finished blocks do not move while new tokens arrive.
   - Blocks do not overlap and do not have large gaps. If they do, the CSS and the measurement do not agree. Do step 5 again.
   - When you resize the window, the text wraps again without overlaps.
   - The browser console has no warnings that start with `[inkset`.
   - Headings, lists, and code look correct in light mode and in dark mode.
4. Tell the user what you changed, which old features have no equivalent, and which renderers you did not change.
