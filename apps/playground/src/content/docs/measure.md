# Measure

The measure layer asks pretext to prepare every text segment in the enriched AST. Plugins supply their own measurements for non-text content.

## What "prepare" means

Pretext's `prepare()` walks the text once, calls `Canvas.measureText` per run, and returns a data structure that can be laid out at any width in constant time per glyph. It's the expensive step — roughly **2 ms per text block** — and it's the step that must never happen in the hot path.

## The cache

Prepared handles are keyed by `(text, font, options)`. When a block's text is unchanged, its prepared handle is reused. This is why you should create your plugin list once at module scope: re-instantiating a plugin invalidates the cache.

## Mixed fonts

For inline content with multiple fonts (a `<code>` inside a paragraph, for example), Inkset uses pretext's `prepareRichInline()` to measure each run with its own font.

## Non-text content

Plugins register a `measure()` function. The code plugin asks Shiki for the rendered dimensions. The math plugin asks KaTeX. The diagram plugin gives back the SVG's intrinsic size.

When a plugin's content hasn't settled yet (Shiki still loading, Mermaid still rendering), the measure function returns a placeholder dimension and signals the layout engine to re-measure once the content settles. The block is marked "pending" until then.

## See also

- [Layout](/docs/layout) — arithmetic over measured glyphs.
- [Transform](/docs/transform) — where enriched nodes come from.
