# Measure

The measure layer asks pretext to prepare every text segment in the enriched AST. Plugins supply their own measurements for non-text content.

## What "prepare" means

Pretext's `prepare()` walks the text once, calls `Canvas.measureText` per run, and returns a data structure that can be laid out at any width in constant time per glyph. It's the expensive step — roughly **2 ms per text block** — and it's the step that must never happen in the hot path.

## The cache

Each block keeps the prepared handles for its own text, so a resize lays them out at the new width without preparing anything again, however long the document is. A shared cache keyed by `(text, font)` also lets a re-parsed block with unchanged text reuse its handles. The block that is still streaming stays out of that cache, since its text changes every frame. This is why you should create your plugin list once at module scope: re-instantiating a plugin rebuilds the pipeline and its caches.

## Mixed fonts

The core text pass still measures against the configured typography. Rich inline presentation, such as inline math or inline code styling, is handled later by the React renderer.

## Non-text content

Plugins can register a synchronous `measure()` function. In practice that usually returns an estimate based on the current width and the kind of content the plugin renders.

When plugin content settles later in the DOM, the rendered component can call `onContentSettled()`. The React layer then re-reads the block height and patches the layout.

## See also

- [Layout](/docs/layout) — arithmetic over measured glyphs.
- [Transform](/docs/transform) — where enriched nodes come from.
