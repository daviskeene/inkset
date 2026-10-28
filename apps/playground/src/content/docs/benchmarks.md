# Benchmarks

The [Compare](/compare) page streams the same response into Inkset, Streamdown, and react-markdown at the same time. It runs in your browser, so you can compare the renderers on your own hardware. Select **Measure** to see the average and peak React render time of each renderer.

## Where the difference comes from

Inkset does less work for each update:

- When a token arrives, Inkset parses and measures only the last block.
- Frozen blocks keep their measurements, so Inkset does not measure them again.
- On resize, Inkset calculates the layout from cached measurements and does not read sizes from the DOM.

## Bundle size

These sizes are approximate and gzipped. They do not include Shiki, KaTeX, and Mermaid, which each library loads as separate chunks.

| Renderer       | Size    | Packages                                                        |
| -------------- | ------- | --------------------------------------------------------------- |
| react-markdown | ~150 KB | `react-markdown` 10, with GFM, math, KaTeX, and highlighting    |
| Streamdown     | ~180 KB | `streamdown` 2.5, with its code, math, and Mermaid plugins      |
| Inkset         | ~50 KB  | `@inkset/core`, `react`, `code`, `math`, `table`, and `diagram` |
