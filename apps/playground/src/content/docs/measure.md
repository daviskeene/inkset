# Measure

The measure stage calculates the width and height of each block. Pretext measures blocks of text, and plugins give the size of their own blocks.

## How Pretext measures text

Pretext does its work in two steps:

1. `prepare()` divides the text into segments and measures the width of each segment with `Canvas.measureText`. It does not read from the DOM. This is the expensive step.
2. `layout()` uses the segment widths to find the line breaks and the height of the text at a given width. This step is arithmetic only.

Inkset calls `prepare()` once for each block of text and keeps the result. When the width changes, Inkset calls only `layout()` again.

## The cache

Inkset keeps the prepared text in a cache. The key is the text and the font. If the text of a block does not change, Inkset uses the cached result.

The cache holds 500 entries by default. If one `<Inkset>` renders a long transcript, increase the limit with the `cacheSize` prop.

## Fonts

Inkset measures text with the `font`, `fontSize`, and `lineHeight` props, and with the heading size, weight, and line-height props. These values must match the CSS that shows the text. If they do not match, Inkset reserves the wrong height for the block.

Inkset measures inline code and inline math with the body font. The React renderer applies their styles after measurement.

## Plugin blocks

A plugin can supply a `measure()` function. It must return a result immediately, so it usually returns an estimate from the current width and the type of content.

When the plugin's component finishes rendering, it calls `onContentSettled()`. Inkset then reads the real height of the block from the DOM and updates the layout.
