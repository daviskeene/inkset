# @inkset/core

## 0.1.6

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

## 0.1.5

### Patch Changes

- 622bed8: Ignore display-math fence examples inside inline code spans when splitting markdown blocks.

## 0.1.4

### Patch Changes

- Improve math block boundary detection so display math and bare LaTeX environments render correctly without requiring defensive blank lines. Multi-line `$$...$$` blocks, inline-positioned display fences, and adjacent `\begin{equation}...\end{equation}` blocks are now split into semantic math blocks before Markdown parsing.

## 0.1.3

### Patch Changes

- Protect inline math before Markdown emphasis parsing and split compact ATX headings and display math fences into semantic blocks.

## 0.1.2

### Patch Changes

- Support bare `\begin{env}...\end{env}` math blocks without `$$` wrapping, strip KaTeX-unsupported `\label{...}`, and resolve `\eqref{...}` cross-references to the matching equation tag.
  - `splitBlocks` tracks LaTeX env depth so nested `\begin{equation}\begin{aligned}...\end{aligned}\end{equation}` stays in a single block across blank lines.
  - `detectBlockType` recognizes common AMS envs (`equation`, `align`, `gather`, `multline`, `cases`, matrix variants, etc.) as `math-display`.
  - `parseBlock` bypasses remark for math blocks so CommonMark escape handling no longer collapses `\\` → `\`.
  - `repair()` resolves `\eqref{name}` by scanning `\label` + `\tag{N}` (or an auto-incremented counter for numbered envs). Short-circuits on docs without `\eqref{`.
  - Math plugin strips `\label{...}` and replaces unresolved `\eqref{...}` with `(?)` before handing LaTeX to KaTeX.

## 0.1.1

### Patch Changes

- cbea9ce: Initial maintenance release following the first successful publish of 0.1.0. No runtime changes — this bump exists so the registry has a version superseding the rushed 0.1.0 slot from the CI debug cycle.
