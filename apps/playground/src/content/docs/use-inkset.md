# useInkset()

`useInkset()` runs the Inkset pipeline without the built-in renderer. Use it when you build your own renderer from the layout, send content to the pipeline from outside React state, or read pipeline metrics and glyph positions. To render Markdown in a React app, use [`<Inkset>`](/docs/component).

## Example

This component draws one box for each block, at the position that Inkset calculated:

```tsx
import { useEffect } from "react";
import { useInkset } from "@inkset/react";
import { createCodePlugin } from "@inkset/code";

const plugins = [createCodePlugin()];

export function BlockOutline({ markdown }: { markdown: string }) {
  const { state, containerRef, setContent, pipelineVersion } = useInkset({ plugins });

  useEffect(() => {
    void setContent(markdown);
  }, [markdown, pipelineVersion, setContent]);

  return (
    <div ref={containerRef} style={{ position: "relative", height: state?.totalHeight }}>
      {state?.layout.map((block) => (
        <div
          key={block.blockId}
          style={{ position: "absolute", top: block.y, height: block.height }}
        >
          {block.kind}
        </div>
      ))}
    </div>
  );
}
```

Attach `containerRef` to an element. Inkset uses the width of that element for the layout. Send the content again when `pipelineVersion` changes, because a new pipeline starts with an empty document.

## Return value

| Field              | What it does                                                                        |
| ------------------ | ----------------------------------------------------------------------------------- |
| `state`            | The current layout, total height, and metrics. It is `null` until the first pass.   |
| `containerRef`     | A ref for the element that sets the layout width.                                   |
| `appendToken()`    | Adds text to the end of the document.                                               |
| `endStream()`      | Ends the stream and freezes the last block.                                         |
| `resumeStream()`   | Opens a finished document again, so that `appendToken()` can add to it.             |
| `setContent()`     | Replaces the full document. Pass `{ streaming: true }` to keep the stream open.     |
| `getGlyphLookup()` | Gives the position of each token in a block. The reveal animations use this lookup. |
| `registry`         | The registered plugins.                                                             |
| `pipelineVersion`  | A number that increases each time Inkset builds a new pipeline.                     |

After `endStream()`, Inkset ignores `appendToken()` until you call `resumeStream()`.

## Options

`useInkset()` takes the layout options of `<Inkset>`: `plugins`, `width`, `font`, `fontSize`, `lineHeight`, `blockSpacing`, `hyphenation`, `shrinkwrap`, the heading props, and `cacheSize`.

The render options are on `<Inkset>` only. These are `theme`, `reveal`, `shaderRegistry`, `unstyled`, `loadingFallback`, and `linkAttrs`.
