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

Inline content such as emphasis, inline code, and links stays inside the block tree. Diagram handling happens later when the diagram plugin claims a `code` block such as a Mermaid fence.

## GFM extensions

The parser supports tables, task lists, strikethrough, footnotes, and autolinks out of the box.

## Why incremental

A naive re-parse of the whole buffer on every token is O(n²) work across a message. Tracking the block index means each token is O(length of hot block), which is bounded by the size of a single paragraph or code fence.

## Custom handling

Plugins do not need the parser to invent a new block type for every rich block. A plugin can register for an existing type, then narrow with `canHandle()` during transform.
