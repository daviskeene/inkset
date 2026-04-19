# Introduction

Inkset is a streaming markdown renderer for LLM output. It combines [pretext](https://github.com/chenglou/pretext)'s DOM-free text measurement with a block-level pipeline designed for tokens arriving over time.

## Why another renderer

Most chat UIs stream tokens into the page and let the browser figure out where things go. That works until someone resizes the window, or the response has code and math, or the stream is fast enough that layout can't keep up. Then you get jitter — each token forces a reflow, each reflow shifts the words the user was reading, and the window feels like it's fighting back.

Inkset measures text once with pretext, then re-layouts with arithmetic. No DOM reads in the hot path. Resize a thousand blocks in under a millisecond.

## What you get

- **Streaming-first** — incomplete syntax is handled at the string level, before parsing. You never see a half-opened `**bold` flashing as `<strong>`.
- **Block-level memoization** — tokens only re-run the last block. Completed blocks are frozen onto absolute coordinates and never re-measure.
- **Rich content out of the box** — code, math, tables, and diagrams are first-class plugins, not stitched-on integrations.
- **Styleable without a design system lock-in** — Inkset ships with a default stylesheet, or you can opt out with `unstyled` and take full control yourself.

## What this is not

It's not a replacement for `react-markdown` in a blog post. If you're rendering static content in a CMS, the cost of Inkset's measurement pass is wasted work.

It's not a full typesetting engine. Pretext handles the hard text-layout parts; Inkset coordinates the pipeline around it.

## Where to go next

- [Install](/docs/install) walks through adding Inkset to an existing React app.
- [Quick start](/docs/quick-start) renders your first streaming message.
- [How it works](/docs/how-it-works) explains the six-stage pipeline the library runs underneath.
