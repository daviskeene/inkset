# @inkset/core

## 0.1.7

### Patch Changes

- 73ed98e: Fix the renderer gaps reported in #14: resolve GFM footnotes and reference-style links across blocks (with document-order numbering, a footnote section at the end, and indented continuation paragraphs kept with their footnote), stop raw HTML from rendering as empty `<div>` wrappers (scroll anchors and `<br>` are kept, everything else is dropped, and zero-height blocks take no layout space and are transparent to `blockSpacing` pair rules between their visible neighbours), keep CommonMark escapes like `\[brackets\]` literal while still promoting LaTeX `\(…\)`/`\[…\]` math, never rewrite delimiters inside code, and stop the streaming inline repair from adding stray `*`/`` ` ``/`~~` closers inside math or code spans or after the document has settled.
- 7593ba1: Make the streaming pipeline race-free and the default-renderer measurements match the stylesheet. A pipeline run or relayout that is overtaken while measuring no longer commits stale state (the final layout after `setContent`/`endStream`/`setWidth` interleavings is always the latest document at the latest width); `init()` is shared across pre-init tokens instead of re-running per frame; a throwing `canHandle` is isolated; scheduled runs can no longer become unhandled rejections; `destroy()` is terminal; shrinkwrap widths are recomputed on resize instead of carried over; width-sensitive plugins re-transform from the parsed AST. Measurement: zero-config code and table blocks are sized as the bare `<pre>`/`<table>` the default renderer emits, list items are summed per `<li>` (nested lists indent, soft breaks collapse, no phantom per-item padding), blockquotes are measured at their inset width without a phantom 16px, image-only paragraphs reserve a line, heading letter-spacing is compensated so headings do not wrap a line early (shrinkwrap widths and reveal glyph positions wrap at that same compensated width, so a one-line heading is never shrinkwrapped onto two), the footnote section is measured as its notes plus the rule and padding the stylesheet adds, and heights are whole pixels.
- 76a1f66: Harden the ingest and parse layers against shapes that real model output produces: `$$` blocks containing `\begin{aligned}…\end{aligned}` no longer split early or swallow the rest of the document, a `\begin{…}` mentioned in prose or inline code no longer collapses everything after it into one block, code fences follow CommonMark's closer rule (same character, at least as long, no info string) consistently across the splitter and repair passes, fences inside blockquotes and list items are recognised (a `\[a-z\]` in a quoted snippet stays code) and a backtick fence whose info string contains backticks is a code span rather than an opener, `$$$` is not a math fence, a second `$$` opener on the same line as a completed span starts its own block, `href`/`src` values with `javascript:`/`data:`/other unsafe schemes are dropped before rendering, inline-math detection no longer pairs a currency `$5` or a `$VAR` with a later `$`, `$` inside autolinks and bare URLs is left alone, and inline-math placeholders never leak into image `alt`/link `title` attributes.

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
