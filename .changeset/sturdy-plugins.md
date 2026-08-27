---
"@inkset/code": patch
"@inkset/math": patch
"@inkset/table": patch
"@inkset/diagram": patch
---

Plugin fixes from the rendering-engine audit. Code: a failed shiki initialization (bad theme name, dropped chunk) no longer poisons highlighting for the rest of the page or turns every later highlight into an unhandled rejection — it retries with the fallback theme; the `langs` option now loads the extra grammars and unknown fence languages render as plain text instead of throwing on every token; a failing light theme no longer wipes the dark render; a failed highlight still settles the block's height; measurement matches the rendered chrome (29px header only when a header renders, no phantom trailing line). Math: `errorDisplay` is honored (`"hide"`/`"message"` were unreachable because KaTeX was called with `throwOnError: false`); a custom `renderer` is actually invoked through its `renderToString` (previously only KaTeX ever rendered, and `createMathJaxRenderer()` — now marked deprecated — silently showed LaTeX source); display-math measurement reserves KaTeX's margins. Table: blocks that are not real tables (a lone `|`, a header row still streaming) are left to the default renderer instead of being wrapped in table chrome with a "Copy CSV" button; measurement matches the stylesheet's row heights. Diagram: ` ```Mermaid ` is detected case-insensitively; no header height is reserved when no header renders. All: `process.env.NODE_ENV` is guarded for unbundled ESM consumers, and copy buttons no longer throw in insecure contexts or on denied clipboard permission.
