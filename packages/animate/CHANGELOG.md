# @inkset/animate

## 0.1.11

### Patch Changes

- 402879b: Make streaming and resize cost scale with what changed instead of with the size of the document.
  - `@inkset/core`: `appendToken()` no longer re-splits the whole document on every token (a 60 KB stream spent seconds of CPU there); the new `Ingest.appendText()` appends without computing block events, and `Ingest.append()` keeps its event API. Each block's prepared pretext handles now live with its node, so a relayout re-prepares nothing no matter how many texts the document has (the shared 500-entry cache used to miss on every lookup past ~450 texts, making a 1000-block resize take 26–80 ms), and the streaming block's per-frame text stays out of the shared cache instead of evicting finished blocks. Shrinkwrap reuses each block's segment handle on resize. Cache eviction is O(1). Blocks without a `$` skip the inline-math protection pass. Removed the unused `marked`, `rehype-sanitize` and `hast-util-to-jsx-runtime` dependencies (27 fewer packages, 1.47 MB less to install).
  - `@inkset/react`: with `reveal` on, a tick only re-wraps and re-measures blocks whose content changed; frozen blocks that are fully revealed are skipped (render time with reveal was 18–24× the no-reveal baseline). The aria mirror text is memoized per block. Frozen blocks no longer set `will-change: transform`, which gave every block its own compositor layer. The default stylesheet is rendered with `href`/`precedence`, so React 19 hoists one copy into `<head>` instead of each `<Inkset>` inserting another (React 18 renders it inline as before).
  - `@inkset/animate`: the token gate has a lag budget, `throttle.maxLagMs` (default 600). While the backlog fits in it, pacing is unchanged; past it, each tick releases a share of the backlog, so a stream faster than one word per `delayInMs` holds steady at about the budget instead of falling further behind (a 518-word answer at ~80 tok/s used to finish displaying ~5 s after the stream ended), and a tick that fires late, as background tabs clamp timers to about one per second, releases what it missed. `maxLagMs: Infinity` restores strict one-unit-per-tick pacing.
  - `@inkset/code`: streaming code blocks are highlighted incrementally: completed lines are tokenized once and cached with shiki's grammar state, so each update tokenizes only the new lines and the growing last line (re-highlighting a 150-line block took ~45 ms per pass). Output is identical to `codeToHtml`, highlighting runs in render with no throttle, and completed lines keep their DOM nodes while the block streams. Grammars now load the first time a block uses them instead of 26 up front (~2.4 MB plus the WASM engine before the first highlight); any language shiki bundles now highlights without configuration, and the `langs` option preloads grammars during `preload()`.

- Updated dependencies [402879b]
  - @inkset/core@0.1.10

## 0.1.10

### Patch Changes

- Updated dependencies [89ffd34]
  - @inkset/core@0.1.9

## 0.1.9

### Patch Changes

- Updated dependencies [734513d]
  - @inkset/core@0.1.8

## 0.1.8

### Patch Changes

- Updated dependencies [73ed98e]
- Updated dependencies [7593ba1]
- Updated dependencies [76a1f66]
  - @inkset/core@0.1.7

## 0.1.7

### Patch Changes

- Updated dependencies [e2e8c59]
  - @inkset/core@0.1.6

## 0.1.6

### Patch Changes

- Updated dependencies [622bed8]
  - @inkset/core@0.1.5

## 0.1.5

### Patch Changes

- Updated dependencies
  - @inkset/core@0.1.4

## 0.1.4

### Patch Changes

- Updated dependencies
  - @inkset/core@0.1.3

## 0.1.3

### Patch Changes

- Updated dependencies
  - @inkset/core@0.1.2

## 0.1.2

### Patch Changes

- Patch release for the latest playground and package updates.
  - `@inkset/react` adds the `cacheSize` prop and improves reveal/shader overlay behavior for long transcripts and dither-style reveals.
  - `@inkset/animate` adds the `ink-dither` built-in shader while preserving `ink-bleed` as a backward-compatible alias.
  - `@inkset/diagram` notifies Inkset when Mermaid content has settled so frozen block layout can update cleanly.

## 0.1.1

### Patch Changes

- cbea9ce: Initial maintenance release following the first successful publish of 0.1.0. No runtime changes — this bump exists so the registry has a version superseding the rushed 0.1.0 slot from the CI debug cycle.
- Updated dependencies [cbea9ce]
  - @inkset/core@0.1.1
