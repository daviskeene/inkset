# useInkset()

A lower-level hook for driving the Inkset pipeline imperatively. Use it when you need direct access to pipeline state, metrics, glyph lookups, or you are building a custom renderer on top of the core layout data.

`useInkset()` does not render Inkset's built-in DOM output on its own. If you want the default renderer, use [`<Inkset>`](/docs/component).

## Return value

```tsx
import { useInkset } from "@inkset/react";
import { createCodePlugin } from "@inkset/code";

const inkset = useInkset({ plugins: [createCodePlugin()] });

// inkset.state          — current layout + metrics
// inkset.containerRef   — width source for the pipeline
// inkset.appendToken()  — push a chunk into the active stream
// inkset.endStream()    — settle the hot block
// inkset.setContent()   — replace the whole document
// inkset.getGlyphLookup() — token coordinate lookup for reveal systems
```

## What it is for

- Custom render targets that want Inkset's measured layout without the built-in DOM renderer
- Imperative content updates from a worker, store, or non-React stream source
- Access to pipeline metrics or glyph-position data for custom effects

## Options

The hook takes the core pipeline options: typography, width, `blockSpacing`, `hyphenation`, `shrinkwrap`, heading tuples, and plugins.

Render-layer props like `theme`, `reveal`, `shaderRegistry`, `unstyled`, and `loadingFallback` belong to [`<Inkset>`](/docs/component), not the hook.

## When to prefer the hook

- You are building a custom renderer around `state.layout`
- You need imperative `appendToken()` / `setContent()` control outside normal React state flow
- You need metrics or glyph-position access for instrumentation or custom animation

If you just want to render markdown in a React app, `<Inkset>` is still the right starting point.

## See also

- [Streaming from an LLM](/docs/streaming) — the recommended high-level streaming path.
- [Render targets](/docs/render-targets) — what Inkset's layout data is designed to feed.
