---
"@inkset/core": patch
"@inkset/react": patch
"@inkset/code": patch
---

Route `<Inkset>` streaming through the incremental pipeline, and fix the cache bugs that surfaced along the way.

- `<Inkset>` now feeds monotonic streamed growth through `appendToken()` deltas instead of re-running the whole document with `setContent()` on every update. Frozen blocks keep their parse/transform/measure caches across ticks (~37x less parse work on long streams), and `PluginContext.isStreaming` is now accurate during component-driven streams.
- `StreamingPipeline.setContent(content, { streaming: true })` keeps the ingest open so subsequent `appendToken()` calls extend the document; `endStream()` is now a no-op on an already-settled document.
- The parse cache validates a frozen block's raw text before reuse, so `repair()` rewrites (e.g. `\eqref{...}` resolving after a later `\label` arrives) re-parse instead of serving a stale AST.
- The block measure cache is keyed on node identity + container width and now works during streaming, instead of only after settle.
- `PipelineMetrics.cacheHitRate` reports the real fraction of blocks whose measurements were reused last run (it previously reported LRU occupancy).
- `Ingest` emits an update event when appended tokens merge blocks (block count decrease), instead of going silent until the next token.
- Block-type detection only classifies tag-shaped starts (`<div`, `</p>`, `<!--`) as HTML; paragraphs like "<3 this idea" stay paragraphs.
- `@inkset/code` throttles shiki re-highlighting to 120ms (leading + trailing) while a code block streams, instead of re-highlighting the full block on every token.
- Removed the per-block `role="article"` inside the `role="log"` container.
