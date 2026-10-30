# Measure

The measure stage calculates the width and height of each block. Pretext measures blocks of text, and plugins give the size of their own blocks.

## How Pretext measures text

Pretext does its work in two steps:

1. `prepare()` divides the text into segments and measures the width of each segment with `Canvas.measureText`. It does not read from the DOM. This is the expensive step.
2. `layout()` uses the segment widths to find the line breaks and the height of the text at a given width. This step is arithmetic only.

Inkset calls `prepare()` once for each block of text and keeps the result. When the width changes, Inkset calls only `layout()` again.

## The cache

Each block keeps its prepared text. On a resize, Inkset lays out the prepared text again at the new width and does not prepare it again. This is true for a document of any length.

Inkset also keeps prepared text in a shared cache. The key is the text and the font. If Inkset parses a block again and its text did not change, Inkset uses the cached result. The block that is still streaming does not go into the cache, because its text changes on each update. The cache holds 500 entries by default. To change the limit, use the `cacheSize` prop.

## Fonts

Inkset measures text with the `font`, `fontSize`, and `lineHeight` props, and with the heading size, weight, and line-height props. These values must match the CSS that shows the text. If they do not match, Inkset reserves the wrong height for the block.

Inkset measures inline code and inline math with the body font. The React renderer applies their styles after measurement.

## Plugin blocks

A plugin can supply a `measure()` function. It must return a result immediately, so it usually returns an estimate from the current width and the type of content.

When the plugin's component finishes rendering, it calls `onContentSettled()`. Inkset then reads the real height of the block from the DOM and updates the layout.
