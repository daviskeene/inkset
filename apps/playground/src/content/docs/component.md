# <Inkset>

`<Inkset>` renders Markdown with the full Inkset pipeline. It includes the default stylesheet, the reveal animations, and a loading state. Use this component unless you need a custom renderer.

## Basic usage

```tsx
import { Inkset } from "@inkset/react";
import { createCodePlugin } from "@inkset/code";

const plugins = [createCodePlugin()];

export function Message({ text, streaming }: { text: string; streaming: boolean }) {
  return <Inkset content={text} streaming={streaming} plugins={plugins} />;
}
```

## Props

| Prop                 | Type                     | Default                   | What it does                                                                 |
| -------------------- | ------------------------ | ------------------------- | ---------------------------------------------------------------------------- |
| `content`            | `string`                 | None                      | The Markdown to render.                                                      |
| `streaming`          | `boolean`                | `false`                   | Set to `true` while tokens arrive. The last block then stays in normal flow. |
| `plugins`            | `InksetPlugin[]`         | `[]`                      | The plugins for rich blocks.                                                 |
| `width`              | `number`                 | Container width           | A fixed layout width in pixels.                                              |
| `font`               | `string`                 | `"system-ui, sans-serif"` | The font family for measurement and CSS.                                     |
| `fontSize`           | `number`                 | `16`                      | The base font size in pixels.                                                |
| `lineHeight`         | `number`                 | `24`                      | The line height in pixels.                                                   |
| `blockSpacing`       | `BlockSpacing`           | `{ default: 16 }`         | The space between blocks. See [Theming](/docs/theming#spacing).              |
| `headingSizes`       | `HeadingSizeTuple`       | `[3, 2.15, 1.3, 1]`       | The size of h1 to h4, as a multiple of `fontSize`.                           |
| `headingWeights`     | `HeadingWeightTuple`     | `[800, 780, 720, 680]`    | The font weight of h1 to h4.                                                 |
| `headingLineHeights` | `HeadingLineHeightTuple` | `[1.05, 1.08, 1.15, 1.2]` | The line height of h1 to h4, as a multiple of each heading's size.           |
| `textWrap`           | `TextWrapOption`         | None                      | The CSS `text-wrap` value, such as `"pretty"` or `"balance"`.                |
| `hyphenation`        | `HyphenationOption`      | None                      | Set to `true` to add hyphenation points to long English words.               |
| `shrinkwrap`         | `ShrinkwrapOption`       | `false`                   | Makes text blocks as narrow as their lines. See [Layout](/docs/layout).      |
| `theme`              | `InksetTheme`            | None                      | Colors and other style tokens. See [Theming](/docs/theming).                 |
| `unstyled`           | `boolean`                | `false`                   | Removes the default stylesheet.                                              |
| `loadingFallback`    | `ReactNode`              | A small spinner           | Shows while plugins load and Inkset measures the first time.                 |
| `reveal`             | `RevealProp`             | None                      | The animation for new text. See [@inkset/animate](/docs/plugin-animate).     |
| `shaderRegistry`     | `ShaderRegistry`         | The built-in shaders      | The shaders that `reveal.shader` can use by name.                            |
| `cacheSize`          | `number`                 | `500`                     | The number of measured text segments that Inkset keeps.                      |
| `linkAttrs`          | `LinkAttrsFn`            | None                      | Returns extra attributes for each link.                                      |
| `className`          | `string`                 | None                      | A class for the root element.                                                |
| `style`              | `CSSProperties`          | None                      | Styles for the root element. These override `theme`.                         |

## Width

If you set `width`, Inkset uses that value. If you do not set it, Inkset watches the width of its container and calculates the layout again when the width changes. Most apps do not need to set `width`.

## Links

Use `linkAttrs` to add attributes to the links in the Markdown. For example, this function opens external links in a new tab:

```tsx
<Inkset
  content={text}
  linkAttrs={(href) =>
    href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : undefined
  }
/>
```

## Styles

`<Inkset>` adds its default stylesheet to the page. If your design system controls all typography, set `unstyled` to remove the stylesheet. Inkset still sets the position of each block inline, so the layout stays correct.
