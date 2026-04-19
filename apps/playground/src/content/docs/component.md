# <Inkset>

The React binding's default component. Pass it markdown and a streaming flag; it handles everything else.

Most apps should start here. `<Inkset>` is the complete DOM renderer. It owns the render layer, built-in stylesheet, reveal layer, and loading states on top of the core pipeline.

## Basic usage

```tsx
import { Inkset } from "@inkset/react";
import { createCodePlugin } from "@inkset/code";

const plugins = [createCodePlugin()];

export function Message({ text, streaming }) {
  return <Inkset content={text} streaming={streaming} plugins={plugins} />;
}
```

## Props

| Prop                 | Type                     | Default                   | What it does                                                                  |
| -------------------- | ------------------------ | ------------------------- | ----------------------------------------------------------------------------- |
| `content`            | `string`                 | —                         | The markdown source. Required.                                                |
| `streaming`          | `boolean`                | `false`                   | When true, the last block stays in native flow so height updates smoothly.    |
| `plugins`            | `InksetPlugin[]`         | `[]`                      | Plugins to run during the transform phase.                                    |
| `width`              | `number`                 | container width           | Layout width in pixels. Pass a fixed width if your container is flexible.     |
| `font`               | `string`                 | system default            | Font-family stack to measure against.                                         |
| `fontSize`           | `number`                 | `16`                      | Base font size in px.                                                         |
| `lineHeight`         | `number`                 | `24`                      | Line height in px.                                                            |
| `blockSpacing`       | `BlockSpacing`           | `{ default: 16 }`         | Semantic spacing policy between frozen blocks.                                |
| `textWrap`           | `TextWrapOption`         | —                         | Progressive-enhancement CSS wrapping hints such as `"pretty"` or `"balance"`. |
| `headingSizes`       | `HeadingSizeTuple`       | `[3, 2.15, 1.3, 1]`       | Em-scale for h1–h4.                                                           |
| `headingWeights`     | `HeadingWeightTuple`     | `[800, 780, 720, 680]`    | Weight for h1–h4.                                                             |
| `headingLineHeights` | `HeadingLineHeightTuple` | `[1.05, 1.08, 1.15, 1.2]` | Line-height multipliers for h1–h4.                                            |
| `hyphenation`        | `HyphenationOption`      | —                         | Whether Inkset inserts manual hyphenation hints.                              |
| `shrinkwrap`         | `ShrinkwrapOption`       | `false`                   | Narrow applicable text blocks to the width of their longest greedy line.      |
| `theme`              | `InksetTheme`            | —                         | Color tokens; see [Theming](/docs/theming).                                   |
| `unstyled`           | `boolean`                | `false`                   | Skip Inkset's built-in stylesheet.                                            |
| `loadingFallback`    | `ReactNode`              | built-in spinner          | Placeholder shown while plugin deps and the first measure pass load.          |
| `reveal`             | `RevealProp`             | —                         | Token animation config; see [@inkset/animate](/docs/plugin-animate).          |
| `shaderRegistry`     | `ShaderRegistry`         | built-in registry         | Registry used to resolve string shader names in `reveal.shader`.              |

`blockSpacing` is the layout-native way to tune rhythm. Set a default gap, then refine it per block kind or per adjacent pair:

```tsx
<Inkset
  blockSpacing={{
    default: 8,
    blocks: {
      heading2: { top: 18, bottom: 6 },
      paragraph: { bottom: 4 },
    },
    pairs: [{ from: "paragraph", to: "heading2", gap: 20 }],
  }}
/>
```

## Fixed vs. flexible width

If you pass `width`, Inkset uses it directly. If you omit it, Inkset observes the container and re-layouts on resize — the arithmetic cost is small enough that this is the recommended default.

## Styling behavior

`<Inkset>` injects its default stylesheet unless you pass `unstyled`. If you are integrating into an existing design system and want to own the entire visual layer yourself, start there.

## Render targets

By default, `<Inkset>` renders to the DOM with absolute positioning for frozen blocks and native flow for the hot block. To render somewhere else, see [Render targets](/docs/render-targets).

## See also

- [useInkset()](/docs/use-inkset) — the hook form, for when you need to push tokens manually.
- [Theming](/docs/theming) — styling the output.
