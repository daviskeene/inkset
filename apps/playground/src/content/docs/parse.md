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
- `diagram`

Inline content within a block (emphasis, inline code, links, inline math) is parsed in a second, inline-level pass.

## GFM extensions

The parser supports tables, task lists, strikethrough, footnotes, and autolinks out of the box.

## Why incremental

A naive re-parse of the whole buffer on every token is O(n²) work across a message. Tracking the block index means each token is O(length of hot block), which is bounded by the size of a single paragraph or code fence.

## Custom block types

Plugins can declare new block types and handle them through the transform layer. See [Writing a plugin](/docs/writing-plugins) for the contract.
