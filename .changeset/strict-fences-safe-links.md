---
"@inkset/core": patch
---

Harden the ingest and parse layers against shapes that real model output produces: `$$` blocks containing `\begin{aligned}…\end{aligned}` no longer split early or swallow the rest of the document, a `\begin{…}` mentioned in prose or inline code no longer collapses everything after it into one block, code fences follow CommonMark's closer rule (same character, at least as long, no info string) consistently across the splitter and repair passes, `$$$` is not a math fence, a second `$$` opener on the same line as a completed span starts its own block, `href`/`src` values with `javascript:`/`data:`/other unsafe schemes are dropped before rendering, inline-math detection no longer pairs a currency `$5` or a `$VAR` with a later `$`, `$` inside autolinks and bare URLs is left alone, and inline-math placeholders never leak into image `alt`/link `title` attributes.
