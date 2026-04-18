# Layout

Layout is where Inkset's performance story lives. Prepared handles are cheap to lay out; the output is a flat list of positioned blocks.

## What layout does

For each block:

- Run `pretext.layout(preparedHandle, containerWidth)` to place each glyph on the block's canvas.
- Sum block heights to compute y-offsets.
- Emit `(x, y, width, height, baseline)` per block.

All of that is arithmetic over numbers. No DOM reads. No `getBoundingClientRect`. No forced reflow.

## The cost

On a modern laptop, layout is roughly **0.0002 ms per block**. A response with a thousand blocks lays out in under a millisecond. That's the budget Inkset spends on every window resize, every container width change, every theme swap that rebreaks lines.

## Variable-width reflow

Pretext handles obstacles — think shrinkwrap at narrower widths, hanging indents, flush margins — through the same layout step. Inkset wires the container width and hyphenation preference through to pretext; the rest is pretext's job.

## Shrinkwrap

If `shrinkwrap` is enabled, pretext widens narrow lines until they fill a target ratio. This is most visible on short messages in a wide container, where naive layout would leave a single word on its own line.

## See also

- [Measure](/docs/measure) — what layout starts with.
- [Render targets](/docs/render-targets) — what layout ends at.
