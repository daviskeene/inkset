# @inkset/code

## 0.1.10

### Patch Changes

- 402879b: Make streaming and resize cost scale with what changed instead of with the size of the document.
  - `@inkset/core`: `appendToken()` no longer re-splits the whole document on every token (a 60 KB stream spent seconds of CPU there); the new `Ingest.appendText()` appends without computing block events, and `Ingest.append()` keeps its event API. Each block's prepared pretext handles now live with its node, so a relayout re-prepares nothing no matter how many texts the document has (the shared 500-entry cache used to miss on every lookup past ~450 texts, making a 1000-block resize take 26–80 ms), and the streaming block's per-frame text stays out of the shared cache instead of evicting finished blocks. Shrinkwrap reuses each block's segment handle on resize. Cache eviction is O(1). Blocks without a `$` skip the inline-math protection pass. Removed the unused `marked`, `rehype-sanitize` and `hast-util-to-jsx-runtime` dependencies (27 fewer packages, 1.47 MB less to install).
  - `@inkset/react`: with `reveal` on, a tick only re-wraps and re-measures blocks whose content changed; frozen blocks that are fully revealed are skipped (render time with reveal was 18–24× the no-reveal baseline). The aria mirror text is memoized per block. Frozen blocks no longer set `will-change: transform`, which gave every block its own compositor layer. The default stylesheet is rendered with `href`/`precedence`, so React 19 hoists one copy into `<head>` instead of each `<Inkset>` inserting another (React 18 renders it inline as before).
  - `@inkset/animate`: the token gate has a lag budget, `throttle.maxLagMs` (default 600). While the backlog fits in it, pacing is unchanged; past it, each tick releases a share of the backlog, so a stream faster than one word per `delayInMs` holds steady at about the budget instead of falling further behind (a 518-word answer at ~80 tok/s used to finish displaying ~5 s after the stream ended), and a tick that fires late, as background tabs clamp timers to about one per second, releases what it missed. `maxLagMs: Infinity` restores strict one-unit-per-tick pacing.
  - `@inkset/code`: streaming code blocks are highlighted incrementally: completed lines are tokenized once and cached with shiki's grammar state, so each update tokenizes only the new lines and the growing last line (re-highlighting a 150-line block took ~45 ms per pass). Output is identical to `codeToHtml`, highlighting runs in render with no throttle, and completed lines keep their DOM nodes while the block streams. Grammars now load the first time a block uses them instead of 26 up front (~2.4 MB plus the WASM engine before the first highlight); any language shiki bundles now highlights without configuration, and the `langs` option preloads grammars during `preload()`.

- Updated dependencies [402879b]
  - @inkset/core@0.1.10

## 0.1.9

### Patch Changes

- Updated dependencies [89ffd34]
  - @inkset/core@0.1.9

## 0.1.8

### Patch Changes

- Updated dependencies [734513d]
  - @inkset/core@0.1.8

## 0.1.7

### Patch Changes

- 63387bb: Plugin fixes from the rendering-engine audit. Code: a failed shiki initialization (dropped chunk) no longer poisons highlighting for the rest of the page or turns every later highlight into an unhandled rejection — the next request retries; themes load one at a time on top of the always-present fallback theme, so a bad theme name costs exactly that theme (a typo'd `lightTheme` no longer blacklists a working `theme`) and degrading to the fallback can never itself throw; the `langs` option now loads the extra grammars and unknown fence languages render as plain text instead of throwing on every token; a failing light theme no longer wipes the dark render; a failed highlight still settles the block's height; measurement matches the rendered chrome (29px header only when a header renders, no phantom trailing line). Math: `errorDisplay` is honored (`"hide"`/`"message"` were unreachable because KaTeX was called with `throwOnError: false`); a custom `renderer` is actually invoked through its `renderToString` (previously only KaTeX ever rendered, and `createMathJaxRenderer()` — now marked deprecated — silently showed LaTeX source); display-math measurement reserves KaTeX's margins. Table: blocks that are not real tables (a lone `|`, a header row still streaming) are left to the default renderer instead of being wrapped in table chrome with a "Copy CSV" button; measurement matches the stylesheet's row heights, and the block settles its height on mount so the estimate never lingers. Diagram: ` ```Mermaid ` is detected case-insensitively; no header height is reserved when no header renders. All: `process.env.NODE_ENV` is guarded for unbundled ESM consumers, and copy buttons no longer throw in insecure contexts or on denied clipboard permission.
- Updated dependencies [73ed98e]
- Updated dependencies [7593ba1]
- Updated dependencies [76a1f66]
  - @inkset/core@0.1.7

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

- Updated dependencies [e2e8c59]
  - @inkset/core@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies [622bed8]
  - @inkset/core@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies
  - @inkset/core@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies
  - @inkset/core@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies
  - @inkset/core@0.1.2

## 0.1.1

### Patch Changes

- cbea9ce: Initial maintenance release following the first successful publish of 0.1.0. No runtime changes — this bump exists so the registry has a version superseding the rushed 0.1.0 slot from the CI debug cycle.
- Updated dependencies [cbea9ce]
  - @inkset/core@0.1.1
