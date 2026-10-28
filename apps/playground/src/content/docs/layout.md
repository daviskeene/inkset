# Layout

The layout stage stacks the measured blocks and calculates the position of each one. It uses only arithmetic, so it does not read from the DOM or cause a browser reflow.

## What layout does

For each block, Inkset does these steps:

1. It gets the height of the block from the measure stage.
2. It adds the space between this block and the next one, from `blockSpacing`.
3. It adds the height and the space to find the `y` position of the next block.

The result is a list of blocks. Each block has an `x` position, a `y` position, a `width`, and a `height`.

Inkset runs the layout stage again each time a block height or the container width changes. A block with zero height, such as an HTML comment, gets no space before or after it.

## Shrinkwrap

The `shrinkwrap` prop makes text blocks narrower. For each block, Inkset finds the smallest width that keeps the same number of lines, and it sets the block to that width. The lines then have more equal lengths, which helps most with short headings in a wide container.

| Value          | Blocks that shrinkwrap                       |
| -------------- | -------------------------------------------- |
| `false`        | None. This is the default.                   |
| `"headings"`   | Headings                                     |
| `"paragraphs"` | Paragraphs and blockquotes                   |
| `true`         | Headings, paragraphs, blockquotes, and lists |
