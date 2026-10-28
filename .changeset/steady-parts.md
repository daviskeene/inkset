---
"@inkset/core": patch
"@inkset/react": patch
---

Content that only grows now always takes the incremental path. Passing longer `content` without `streaming` (a react-markdown-style integration), or resuming a settled message, used to replace the whole document on every update: every cache and observed height was discarded, so blocks briefly jumped to their estimated heights and each update re-parsed the full document. Core adds `StreamingPipeline.resumeStream()`, and `useInkset()` exposes it as `resumeStream()`. A settled document now keeps an in-flow spacer under its absolutely positioned blocks, because Chromium never anchors scrolling on absolutely positioned elements; without it, content growing above a settled message pushed the reader down by the full amount. `children` passed to `<Inkset>` now render after the content instead of over its first block. React adds `InksetParts`, which renders Markdown parts interleaved with application components: each Markdown part runs its own pipeline, and surfaces sit between them in normal document flow, outside Inkset's absolute layout, live region and reveal wrappers.
