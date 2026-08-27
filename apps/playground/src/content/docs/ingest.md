# Ingest & repair

The ingest layer accumulates streaming tokens into a growing markdown string and keeps the downstream parser from ever seeing a half-written block.

## What it handles

- **Token accumulation.** A growing buffer is the source of truth. New tokens append.
- **Block boundaries.** Paragraph breaks, code-fence open / close, heading markers, block-level math delimiters — all detected at the string level.
- **Syntax repair.** Unterminated `**bold**`, `` `code` ``, `[links]()`, `$$math$$`, and fenced code blocks are auto-closed before the parser sees them.
- **Math delimiter normalization.** LaTeX-style `\(…\)` and `\[…\]` are rewritten to `$…$` and `$$…$$`.

## Why repair at the string level

If you wait until the AST phase, the parser emits half-broken nodes that cause UI flicker: a `<strong>` that appears, disappears, then reappears as a full span. By closing the syntax speculatively before parsing, the AST stays stable across token arrivals.

## What the parser sees

Always a well-formed document. The ingest layer guarantees that every open token has a matching close — even if it was inserted synthetically and will be removed on the next token when the real close arrives.

Inline closers (`**`, `*`, `` ` ``, `~~`) are only added while the stream is open. Once the document is complete, a trailing `*` or backtick is the author's, and repair leaves it alone. Delimiters inside inline code and math spans are never counted, so `` `SELECT *` `` or `$x^*$` on the last line never earn a stray closer.

## Delimiter normalization and CommonMark escapes

`\[` and `\(` are CommonMark escapes for literal brackets as well as LaTeX math delimiters. Inkset promotes a pair to math only when what sits between reads as math — a TeX command, an operator, a brace, a sub/superscript, a one- or two-letter identifier, or function application like `f(x)`. `\[brackets\]`, `\[citation needed\]` and `\[1\]` stay literal. Code is never touched: fenced blocks and inline code spans pass through untouched, so a regex like `/\[a-z\]/` in a snippet survives.

## See also

- [Parse](/docs/parse) — what happens after ingest hands off a string.
- [Streaming from an LLM](/docs/streaming) — wiring real LLM output through ingest.
