# Ingest and repair

The ingest stage collects streaming tokens into one Markdown string. Before the parser reads the string, the ingest stage closes all syntax that is still open, so the parser always gets complete Markdown.

## What ingest does

- **Collects tokens.** Each new token goes at the end of a buffer that holds the full document.
- **Finds block boundaries.** Inkset finds paragraph breaks, headings, code fences, and display math delimiters in the string, before it parses.
- **Closes open syntax.** Inkset adds a closing marker to an open code fence or `$$` math block. On the last line, it also closes open `**`, `*`, `` ` ``, and `~~` markers.
- **Normalizes math delimiters.** Inkset changes the LaTeX delimiters `\(…\)` to `$…$` and `\[…\]` to `$$…$$`.

## Why repair comes before parsing

If the parser reads `**bold` with no closing marker, it shows the asterisks as text. When the closing marker arrives, the same text becomes bold, and the user sees a flicker. Inkset adds the closing marker before it parses, so the text is bold from its first token and stays bold as more tokens arrive.

The added markers are temporary. When the real closing marker arrives, it replaces the added one.

## When repair applies

Inkset closes inline markers only while the stream is open. In a complete document, a `*` or a backtick at the end of a line belongs to the author, and Inkset does not change it.

Inkset does not count markers inside inline code or math. For example, `` `SELECT *` `` and `$x^*$` on the last line do not get an extra closing marker.

## Math delimiters and escaped brackets

In CommonMark, `\[` and `\(` are escaped brackets. In LaTeX, they start math. Inkset changes a pair to math only when its content looks like math. These are examples of content that looks like math:

- A TeX command, such as `\frac`
- An operator or a brace
- A subscript or a superscript
- A name with one or two letters
- A function call, such as `f(x)`

Text such as `\[brackets\]`, `\[citation needed\]`, and `\[1\]` stays as brackets. Inkset does not change code, so a regular expression such as `/\[a-z\]/` in a code block or in inline code keeps its exact text.
