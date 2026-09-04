# @inkset/react

## 0.1.9

### Patch Changes

- cbc9c1a: React renderer fixes from the rendering-engine audit: the reveal gate no longer drops streamed text when React StrictMode replays effects or when `reveal.component` is an inline arrow (the first chunk, or nearly everything, went missing); a replaced document no longer inherits the previous document's observed heights (a 200px math block left a 200px gap above the new first paragraph); the shader WebGL instance is no longer disposed and re-created on every height change; the hot block keeps its DOM element and plugin state when it freezes instead of remounting (code blocks flashed unstyled at every block boundary); frozen default-rendered blocks can now shrink to their real height instead of keeping an over-estimate forever, while a plugin block no longer collapses to its raw fallback height (a one-line LaTeX source before KaTeX renders) before the plugin settles; a gate with `delayInMs: 0` no longer duplicates the stream under StrictMode; the `shrinkwrap` stylesheet selector actually matches the rendered tree; deferred height flushes survive StrictMode's double-invoked updaters; static content is submitted to the pipeline once per mount instead of twice; long unbreakable tokens wrap like pretext assumes; and smart copy only substitutes source text for a code/math/table block when the whole block is selected.
- 73ed98e: Fix the renderer gaps reported in #14: resolve GFM footnotes and reference-style links across blocks (with document-order numbering, a footnote section at the end, and indented continuation paragraphs kept with their footnote), stop raw HTML from rendering as empty `<div>` wrappers (scroll anchors and `<br>` are kept, everything else is dropped, and zero-height blocks take no layout space and are transparent to `blockSpacing` pair rules between their visible neighbours), keep CommonMark escapes like `\[brackets\]` literal while still promoting LaTeX `\(…\)`/`\[…\]` math, never rewrite delimiters inside code, and stop the streaming inline repair from adding stray `*`/`` ` ``/`~~` closers inside math or code spans or after the document has settled.
- Updated dependencies [73ed98e]
- Updated dependencies [7593ba1]
- Updated dependencies [76a1f66]
  - @inkset/core@0.1.7
  - @inkset/animate@0.1.8

## 0.1.8

### Patch Changes

- e2e8c59: Route `<Inkset>` streaming through the incremental pipeline, and fix the cache bugs that surfaced along the way.
  - `<Inkset>` now feeds monotonic streamed growth through `appendToken()` deltas instead of re-running the whole document with `setContent()` on every update. Frozen blocks keep their parse/transform/measure caches across ticks (~37x less parse work on long streams), and `PluginContext.isStreaming` is now accurate during component-driven streams.
  - `StreamingPipeline.setContent(content, { streaming: true })` keeps the ingest open so subsequent `appendToken()` calls extend the document; `endStream()` is now a no-op on an already-settled document.
  - The parse cache validates a frozen block's raw text before reuse, so `repair()` rewrites (e.g. `\eqref{...}` resolving after a later `\label` arrives) re-parse instead of serving a stale AST.
  - The block measure cache is keyed on node identity + container width and now works during streaming, instead of only after settle.
  - `PipelineMetrics.cacheHitRate` reports the real fraction of blocks whose measurements were reused last run (it previously reported LRU occupancy).
  - `Ingest` emits an update event when appended tokens merge blocks (block count decrease), instead of going silent until the next token.
  - Block-type detection only classifies tag-shaped starts (`<div`, `</p>`, `<!--`) as HTML; paragraphs like "<3 this idea" stay paragraphs.
  - `@inkset/code` throttles shiki re-highlighting to 120ms (leading + trailing) while a code block streams, instead of re-highlighting the full block on every token.
  - Removed the per-block `role="article"` inside the `role="log"` container.

- Updated dependencies [e2e8c59]
  - @inkset/core@0.1.6
  - @inkset/animate@0.1.7

## 0.1.7

### Patch Changes

- Updated dependencies [622bed8]
  - @inkset/core@0.1.5
  - @inkset/animate@0.1.6

## 0.1.6

### Patch Changes

- 38f982f: Fix frozen block layout after inline math content settles.

## 0.1.5

### Patch Changes

- Updated dependencies
  - @inkset/core@0.1.4
  - @inkset/animate@0.1.5

## 0.1.4

### Patch Changes

- Render semantic inline math nodes from `@inkset/core` and add a `linkAttrs` hook for Markdown anchors.
- Updated dependencies
  - @inkset/core@0.1.3
  - @inkset/animate@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies
  - @inkset/core@0.1.2
  - @inkset/animate@0.1.3

## 0.1.2

### Patch Changes

- Patch release for the latest playground and package updates.
  - `@inkset/react` adds the `cacheSize` prop and improves reveal/shader overlay behavior for long transcripts and dither-style reveals.
  - `@inkset/animate` adds the `ink-dither` built-in shader while preserving `ink-bleed` as a backward-compatible alias.
  - `@inkset/diagram` notifies Inkset when Mermaid content has settled so frozen block layout can update cleanly.

- Updated dependencies
  - @inkset/animate@0.1.2

## 0.1.1

### Patch Changes

- cbea9ce: Initial maintenance release following the first successful publish of 0.1.0. No runtime changes — this bump exists so the registry has a version superseding the rushed 0.1.0 slot from the CI debug cycle.
- Updated dependencies [cbea9ce]
  - @inkset/core@0.1.1
  - @inkset/animate@0.1.1
