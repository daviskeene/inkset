# Benchmarks

Numbers on a MacBook Pro M1, Chrome 125, measured with `performance.now()` across 50 runs. Your mileage will vary.

## Layout cost

A resize of a 1000-block response. Measurement is cached; layout runs fresh.

| Renderer         | Time per resize |
| ---------------- | --------------- |
| `react-markdown` | 180–240 ms      |
| `streamdown`     | 40–60 ms        |
| **`inkset`**     | **0.6–0.9 ms**  |

The reason is structural, not micro-optimized: react-markdown and streamdown both call `getBoundingClientRect` as part of their reflow path; Inkset runs arithmetic over cached glyphs.

## Streaming cost

Per-token render during an active stream, 340 chars/sec.

| Renderer         | Per-token render |
| ---------------- | ---------------- |
| `react-markdown` | 6–14 ms          |
| `streamdown`     | 1.5–3.5 ms       |
| **`inkset`**     | **0.3–0.6 ms**   |

## Bundle size

Gzipped, measured at pinned versions.

| Renderer         | Size       | Notes                                           |
| ---------------- | ---------- | ----------------------------------------------- |
| `react-markdown` | ~150 KB    | Plus remark/rehype/katex/highlight.             |
| `streamdown`     | ~180 KB    | Plus Tailwind (required).                       |
| **`inkset`**     | **~55 KB** | `core + react + code + math + table + diagram`. |

Plugin bundles (Shiki, KaTeX, Mermaid) are loaded on demand by each library so peak network cost is higher; see individual plugin docs.

## Running the benchmark

```bash
pnpm --filter @inkset/playground benchmark
```

This opens the `/compare` page in a headless browser, runs the scenarios, and writes `perf.json`. See [/compare](/compare) for the interactive version.

## See also

- [How it works](/docs/how-it-works) — the pipeline that produces these numbers.
