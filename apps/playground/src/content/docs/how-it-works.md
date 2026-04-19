# How it works

Inkset is a six-stage pipeline. Every block walks the same broad path, but streaming updates only re-run the hot block, and resizes can often reuse cached text preparation.

## The stages

1. **Ingest** — accumulate tokens, detect block boundaries, repair incomplete syntax.
2. **Parse** — markdown to AST, incrementally.
3. **Transform** — plugins enrich the AST with rendering data.
4. **Measure** — pretext prepares each text segment; plugins measure non-text blocks.
5. **Layout** — pretext arithmetic positions each block with the container width.
6. **Render** — absolute positioning for frozen blocks, native flow for the hot block.

Each stage is described in its own page in the Core section.

## What "hot block" means

The block currently receiving tokens is the **hot block**. It's rendered in native document flow, so the browser computes its height without any help from us. Every block above it is **frozen**: positioned absolutely with coordinates computed by pretext.

When a new token arrives:

- The hot block's raw text is updated.
- Its AST is re-parsed (only the hot block).
- Its measurement is re-run (only the hot block).
- Its layout is re-computed (only the hot block).
- The browser reflows its flow-positioned box naturally.

Nothing frozen moves. Nothing frozen re-measures.

## When the window resizes

On a resize, Inkset can usually reuse pretext's prepared text and rerun `layout()` at the new width. Width-sensitive plugins may also re-transform or re-measure, and rich blocks can still settle later through the React layer.

## When the stream ends

When you signal end-of-stream (by toggling `streaming={false}` or calling `endStream()`), the hot block is measured, positioned, and promoted to frozen. The next message can now start its own pipeline.
