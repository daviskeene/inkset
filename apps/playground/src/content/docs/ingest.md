# Ingest & repair

The ingest layer accumulates streaming tokens into a growing markdown string and keeps the downstream parser from ever seeing a half-written block.

## What it handles

- **Token accumulation.** A growing buffer is the source of truth. New tokens append.
- **Block boundaries.** Paragraph breaks, code-fence open / close, heading markers, block-level math delimiters — all detected at the string level.
- **Syntax repair.** Unterminated `**bold**`, `` `code` ``, `[links]()`, `$$math$$`, and fenced code blocks are auto-closed before the parser sees them.

## Why repair at the string level

If you wait until the AST phase, the parser emits half-broken nodes that cause UI flicker: a `<strong>` that appears, disappears, then reappears as a full span. By closing the syntax speculatively before parsing, the AST stays stable across token arrivals.

## What the parser sees

Always a well-formed document. The ingest layer guarantees that every open token has a matching close — even if it was inserted synthetically and will be removed on the next token when the real close arrives.

## See also

- [Parse](/docs/parse) — what happens after ingest hands off a string.
- [Streaming from an LLM](/docs/streaming) — wiring real LLM output through ingest.
