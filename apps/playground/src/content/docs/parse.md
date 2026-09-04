# Parse

The parse layer tokenizes the repaired markdown into a block-level AST. It runs incrementally: only the last (incomplete) block is re-parsed when new tokens arrive. Completed blocks are frozen in the AST.

## Block types

- `paragraph`
- `heading`
- `code`
- `math-display`
- `table`
- `list`
- `blockquote`
- `html`
- `thematic-break`
- `footnotes`

Inline content such as emphasis, inline code, and links stays inside the block tree. Diagram handling happens later when the diagram plugin claims a `code` block such as a Mermaid fence.

## GFM extensions

The parser supports tables, task lists, strikethrough, footnotes, and autolinks out of the box.

Footnotes and reference-style links need the whole document, not just one block: `[^1]` in the second paragraph has to find `[^1]: …` at the bottom. Before parsing, the pipeline collects every footnote and link reference definition, hands each block the definitions it cites, and numbers footnotes by the order they are first referenced. Footnote definitions are merged into a single `footnotes` block rendered at the end of the document, the same place GitHub puts them; unreferenced definitions render nothing.

## Raw HTML

Inkset does not run an HTML parser or sanitizer over model output, so raw HTML in markdown is dropped rather than rendered — the same default as react-markdown. Two shapes are kept because dropping them loses meaning: `<a id="…"></a>` scroll anchors become an empty anchor element, and `<br>` becomes a line break. HTML comments and anything else contribute nothing, so a block that is only an anchor or a comment measures at zero height and takes no space in the layout.

## Why incremental

A naive re-parse of the whole buffer on every token is O(n²) work across a message. Tracking the block index means each token is O(length of hot block), which is bounded by the size of a single paragraph or code fence.

## Custom handling

Plugins do not need the parser to invent a new block type for every rich block. A plugin can register for an existing type, then narrow with `canHandle()` during transform.
