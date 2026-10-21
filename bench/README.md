# Benchmarks

Scenarios that time Inkset's hot paths in headless Chrome, so pretext measures text with a real Canvas the way it does in an app.

```bash
pnpm build
pnpm bench                       # this checkout
pnpm bench --root ../inkset-main # another checkout, for a before/after
pnpm bench --only core           # just one scenario file
```

Results print as JSON. Set `CHROME_PATH` if Chrome isn't installed in its default location.

## Scenarios

`scenarios/core.js` drives `StreamingPipeline` directly:

| Result                        | What it measures                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `stream12k`, `stream60k`      | Streaming a 12 KB / 60 KB answer in 2–6 character tokens, 32 characters per frame. |
| `appendPerTokenUs`            | Time inside `appendToken()` per token.                                             |
| `pipelinePerFrameMs`          | One pipeline run (repair, split, parse, transform, measure, layout) per frame.     |
| `firstResizeAfterStreamMs`    | The first `setWidth()` after the stream ends.                                      |
| `relayout500`, `relayout1000` | `setWidth()` on a settled 500- / 1000-block document, 25 resizes after 5 warm-ups. |

`scenarios/react.js` renders `<Inkset>` with React's profiling build:

| Result                  | What it measures                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `revealOff`, `revealOn` | `<Profiler>` render time per commit while streaming a 30 KB answer, without and with `reveal`.                             |
| `codeStreaming`         | Long tasks (over 50 ms) while a 150-line code block streams through `@inkset/code`.                                        |
| `revealLag`             | How long after the stream ends the default `reveal={{}}` gate finishes showing a ~520-word answer streamed at 320 chars/s. |

The fixture in `fixture.js` is synthetic but shaped like model output: headings, prose with inline code and links, nested lists, fenced code, tables and blockquotes. It is deterministic, so two runs see the same input.

## Reading the numbers

Timings move with the machine's load and power state. Compare two builds by running them alternately on the same machine, several times each, and comparing medians, rather than comparing against numbers recorded elsewhere. Chrome rounds `performance.now()` to 100 µs.
