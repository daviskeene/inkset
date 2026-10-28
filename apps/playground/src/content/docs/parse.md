# Parse

The parse stage converts the repaired Markdown into a syntax tree for each block. When a token arrives, Inkset parses only the last block again. Finished blocks keep the tree that Inkset made for them.

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

Inline content, such as emphasis, inline code, and links, stays inside the tree of its block. A Mermaid diagram is a `code` block, and the diagram plugin claims it in the transform stage.

## GitHub Flavored Markdown

Inkset supports tables, task lists, strikethrough, footnotes, and autolinks.

Footnotes and reference links need information from other parts of the document. For example, a `[^1]` reference in the second paragraph needs the `[^1]: …` definition at the end. Before Inkset parses the blocks, it collects all footnote and link definitions and gives each block the definitions that it uses.

Footnotes get their numbers in the order of their first reference. Inkset puts all footnote definitions into one `footnotes` block at the end of the document, where GitHub also puts them. A definition that has no reference does not render.

## Raw HTML

Inkset does not render raw HTML from model output, because it does not parse or sanitize HTML. react-markdown has the same default.

Inkset keeps two HTML forms because they have a meaning in the document:

- An `<a id="…"></a>` anchor becomes an empty anchor element, so links to it work.
- A `<br>` tag becomes a line break.

Inkset removes HTML comments and all other HTML. A block that contains only an anchor or a comment has zero height and takes no space in the layout.

## Why parsing is incremental

If Inkset parsed the full document on each token, the parse work for one message would grow with the square of its length. Inkset parses only the last block, so the parse work for each token depends only on the size of that block.

## Plugins and block types

A plugin does not need a new block type. It registers for an existing type, such as `code`, and uses `canHandle()` to claim only some blocks of that type. See [Transform](/docs/transform).
