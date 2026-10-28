# How it works

Inkset sends each block of Markdown through a pipeline of six stages. When a token arrives, only the last block goes through the pipeline again. On resize, Inkset uses its cached text measurements and calculates the layout again at the new width.

## The stages

1. **Ingest.** Inkset adds new tokens to the document, finds the block boundaries, and closes unfinished syntax.
2. **Parse.** Inkset converts each block of Markdown to a syntax tree.
3. **Transform.** Plugins add the data that they need to render their blocks.
4. **Measure.** Pretext measures text blocks. Plugins estimate the size of their own blocks.
5. **Layout.** Inkset stacks the blocks and calculates the position of each one.
6. **Render.** React renders each block at its position.

## Frozen blocks and the hot block

The last block, which receives tokens, is the **hot block**. Inkset renders it in normal document flow, so the browser sets its height as the text grows.

All blocks above it are **frozen**. Inkset positions each frozen block absolutely, at the coordinates from the layout stage.

When a token arrives, Inkset parses, measures, and lays out only the hot block. Frozen blocks do not move, and Inkset does not measure them again. When a new block starts, the previous hot block becomes frozen.

## Resize

On resize, Inkset uses the cached Pretext measurements to find the new line breaks and heights. It does not read sizes from the DOM. Plugins that set `widthSensitive` run their transform again. A plugin block can also report a new height after it renders at the new width.

## End of the stream

When you set `streaming` to `false`, or call `endStream()` from `useInkset()`, Inkset measures the hot block, calculates its position, and freezes it.
