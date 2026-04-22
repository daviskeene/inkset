# Introduction

Inkset is rendering infrastructure for streaming model output. It started as a markdown renderer, because that is what models emit today. The part worth paying attention to is the layer underneath: a pipeline that measures content once with [pretext](https://github.com/chenglou/pretext) and re-lays it out with arithmetic, so the renderer stays stable while tokens stream, while windows resize, and while conversations grow into the thousands of messages.

## Why another renderer

Most chat UIs stream tokens into the page and let the browser figure out where things go. That works until someone resizes the window, or the response has code and math, or the stream is fast enough that layout can't keep up. Then you get jitter. Each token forces a reflow. Each reflow shifts the words the user was reading. The window feels like it is fighting back.

The same failure mode scales up. Long conversations get heavy because the browser is recalculating layout for the whole thread on every new message. Mobile feels it first, because reflow is cheaper on a desktop CPU than on a phone.

Inkset treats this as a layout problem, not a parsing problem. Pretext measures text once with Canvas, then re-layouts with arithmetic. No DOM reads in the hot path. A thousand blocks relayout in under a millisecond.

## What you get

**Stable streaming.** Completed blocks are frozen onto absolute coordinates computed by pretext. The block currently receiving tokens rides in normal document flow. New tokens do not shift what the user is already reading, because the frozen blocks never re-measure.

**Cheap resize.** On a window resize, Inkset reuses pretext's prepared text and reruns `layout()` at the new width. The hot path is pure arithmetic over cached segment widths. Good for INP. Good for mobile.

**Long conversations that stay usable.** Heights are known before blocks mount, so virtual scrolling works correctly instead of needing height estimates and jumpy scrollbars. Thousand-turn conversations stop being a product-level problem.

**Rich content in the same pipeline.** Code, math, tables, and diagrams are plugins. They participate in measurement and layout the same way text does, so they do not fight the rest of the column or produce second-order reflow when they settle.

**Incremental syntax repair.** Incomplete markdown is repaired at the string level before parsing. You never see a half-opened `**bold` flashing as `<strong>` mid-stream.

**Protocol-neutral.** The plugin contract is shaped for async-settling content: provisional height, settled height when the content loads, local recompute without disturbing siblings. Generative UI components (json-render, A2UI) fit the same contract as code blocks and math.

**Styling on your terms.** Ship with the default stylesheet, or set `unstyled` and bring your own.

## What this is not

It is not a replacement for `react-markdown` in a blog post. If you are rendering static content in a CMS, the cost of Inkset's measurement pass is wasted work.

It is not a full typesetting engine. Pretext handles the hard text-layout parts. Inkset coordinates the pipeline around it and extends it to non-text content.

It is not finished. SSR currently falls back to a character-width estimate when Canvas isn't available. Framework adapters beyond React are on the roadmap. Selection across absolute-positioned blocks needs a custom selection layer. See the README status section for the live list.

## Where to go next

- [Install](/docs/install) walks through adding Inkset to an existing React app.
- [Quick start](/docs/quick-start) renders your first streaming message.
- [How it works](/docs/how-it-works) explains the six-stage pipeline the library runs underneath.
