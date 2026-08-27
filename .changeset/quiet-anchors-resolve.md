---
"@inkset/core": patch
"@inkset/react": patch
---

Fix the renderer gaps reported in #14: resolve GFM footnotes and reference-style links across blocks (with document-order numbering and a footnote section at the end), stop raw HTML from rendering as empty `<div>` wrappers (scroll anchors and `<br>` are kept, everything else is dropped, and zero-height blocks take no layout space), keep CommonMark escapes like `\[brackets\]` literal while still promoting LaTeX `\(…\)`/`\[…\]` math, never rewrite delimiters inside code, and stop the streaming inline repair from adding stray `*`/`` ` ``/`~~` closers inside math or code spans or after the document has settled.
