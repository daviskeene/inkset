# Benchmarks

The [Compare](/compare) page streams the same response into Inkset, Streamdown, and react-markdown at the same time, so you can see how each renderer shows the same tokens in your browser.

## Where the difference comes from

Inkset does less work for each update:

- When a token arrives, Inkset parses and measures only the last block.
- Frozen blocks keep their measurements, so Inkset does not measure them again.
- On resize, Inkset calculates the layout from cached measurements and does not read sizes from the DOM.

## Bundle size

The table shows the JavaScript that each renderer loads up front, with the plugins that the Compare page uses. The sizes are minified and gzipped, and they do not include React. Chunks that load only when a block needs them, such as Shiki languages and Mermaid, are not included. Inkset puts its styles in its JavaScript, so only the Inkset size includes CSS.

| Renderer       | Up front | Packages                                                            |
| -------------- | -------- | ------------------------------------------------------------------- |
| Inkset         | 65 KB    | `@inkset/react` 0.1.12, with `code`, `math`, `table`, and `diagram` |
| react-markdown | 178 KB   | `react-markdown` 10.1, with GFM, math, KaTeX, and highlight.js      |
| Streamdown     | 443 KB   | `streamdown` 2.5, with its code, math, and Mermaid plugins          |

The script `apps/playground/scripts/measure-bundles.mjs` in the repository calculates these sizes.
