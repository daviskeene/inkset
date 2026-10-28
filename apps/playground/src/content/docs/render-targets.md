# Render targets

`@inkset/react` renders the layout to the DOM. The layout itself is a list of positioned blocks that does not depend on the DOM, so you can also use it with your own renderer through [`useInkset()`](/docs/use-inkset).

## The DOM renderer

Each frozen block is a `<div>` with `position: absolute`. A CSS transform moves the block to the `x` and `y` position from the layout. The hot block is a `<div>` in normal document flow.

Plugins render their own DOM inside their blocks. For example, `@inkset/code` renders Shiki HTML, `@inkset/math` renders KaTeX HTML, and `@inkset/diagram` renders a Mermaid SVG.

## Why frozen blocks use absolute positioning

Inkset knows the position of each frozen block before it writes to the DOM. An absolutely positioned block is outside the document flow, so a change to the hot block does not cause the browser to lay out the frozen blocks again.

## Server rendering

Inkset needs Canvas to measure text, so it renders content only in the browser. During server rendering, `<Inkset>` shows its `loadingFallback`. After the component mounts in the browser, Inkset measures the text and shows the content.

## Other targets

Inkset includes only the DOM renderer. To draw the content in a different way, such as on a canvas, use `useInkset()` and render from `state.layout`.
