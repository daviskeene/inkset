# Render targets

Today, Inkset ships with a DOM renderer through the React binding. The layout data is still structured so other targets are possible later.

## The built-in target

The React binding's default target is the DOM. Each frozen block becomes a `<div>` with `position: absolute` and pretext-computed `left` / `top` / `width` / `height`. The hot block becomes a `<div>` in native flow.

Plugins emit their own DOM for non-text blocks — Shiki's highlighted markup for code, KaTeX's HTML for math, Mermaid's SVG for diagrams.

## Why absolute positioning

Because layout ran entirely outside the DOM, we know exactly where every block goes before writing anything. Flowing blocks would force the browser to run its own layout pass, which would discard our pre-computed coordinates. Absolute positioning lets the browser skip layout for the frozen region entirely.

## SSR

On the server, layout runs against pretext's fallback — character-width estimates without Canvas. The output is still correct markup; the measurements are approximate. When the client hydrates, pretext re-measures against Canvas and patches the frozen coordinates without a visible jump.

## Canvas and custom targets

The core's layout output is framework-agnostic — a flat list of positioned blocks. A canvas renderer or PDF target could be built on top of that. Neither ships in v1.

## See also

- [Theming](/docs/theming) — CSS custom properties the DOM target reads.
- [Writing a plugin](/docs/writing-plugins) — adding a custom render target for a new block type.
