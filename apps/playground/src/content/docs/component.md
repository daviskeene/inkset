# <Inkset>

The React binding's default component. Pass it markdown and a streaming flag; it handles everything else.

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

| Prop             | Type                 | Default                | What it does                                                               |
| ---------------- | -------------------- | ---------------------- | -------------------------------------------------------------------------- |
| `content`        | `string`             | —                      | The markdown source. Required.                                             |
| `streaming`      | `boolean`            | `false`                | When true, the last block stays in native flow so height updates smoothly. |
| `plugins`        | `InksetPlugin[]`     | `[]`                   | Plugins to run during the transform phase.                                 |
| `width`          | `number`             | container width        | Layout width in pixels. Pass a fixed width if your container is flexible.  |
| `font`           | `string`             | system default         | Font-family stack to measure against.                                      |
| `fontSize`       | `number`             | `16`                   | Base font size in px.                                                      |
| `lineHeight`     | `number`             | `1.55 × fontSize`      | Line height in px.                                                         |
| `blockSpacing`   | `BlockSpacing`       | `{ default: 16 }`      | Semantic spacing policy between frozen blocks.                             |
| `headingSizes`   | `HeadingSizeTuple`   | `[2, 1.5, 1.2, 1]`     | Em-scale for h1–h4.                                                        |
| `headingWeights` | `HeadingWeightTuple` | `[700, 600, 600, 600]` | Weight for h1–h4.                                                          |
| `hyphenation`    | `HyphenationOption`  | `"auto"`               | Whether pretext breaks long words.                                         |
| `shrinkwrap`     | `ShrinkwrapOption`   | `"off"`                | Widen narrow lines to fill the container.                                  |
| `theme`          | `InksetTheme`        | —                      | Color tokens; see [Theming](/docs/theming).                                |
| `reveal`         | `RevealProp`         | —                      | Token animation config; see [@inkset/animate](/docs/plugin-animate).       |

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

## Render targets

By default, `<Inkset>` renders to the DOM with absolute positioning for frozen blocks and native flow for the hot block. To render somewhere else, see [Render targets](/docs/render-targets).

## See also

- [useInkset()](/docs/use-inkset) — the hook form, for when you need to push tokens manually.
- [Theming](/docs/theming) — styling the output.
