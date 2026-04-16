# Inkset TODOS

## v1 Post-Ship

### Benchmark Suite vs. Competitors
**What:** Reproducible benchmarks comparing inkset vs Streamdown vs react-markdown on streaming throughput, resize reflow time, memory usage, time-to-first-paint.
**Why:** Hard numbers are the "why switch" argument. Published in README.
**Effort:** S (human) / S (CC) | **Priority:** P2
**Depends on:** v1 core pipeline complete

### Vercel AI SDK Integration Example
**What:** First-class example showing inkset as a drop-in for Streamdown in Vercel AI SDK's useChat() workflow.
**Why:** The migration path for Streamdown's 22M-download user base. "Here's the same app with 5 lines changed."
**Effort:** S | **Priority:** P2
**Depends on:** @inkset/react stable

## v2

### Framework-Agnostic Core Extraction
**What:** Extract core pipeline (ingest/parse/measure/layout) from the React adapter into a standalone vanilla JS package. Ship @inkset/vue and @inkset/svelte adapters.
**Why:** The v2 vision: inkset works everywhere, not just React. Enables Vue, Svelte, and vanilla JS consumers.
**Effort:** M (human) / S (CC) | **Priority:** P1 for v2
**Depends on:** Stable core API proven through React adapter usage

### Canvas-Based Rendering Target
**What:** Alternative rendering target that uses Canvas 2D instead of DOM. For infinite canvas apps, design tools, presentation software.
**Why:** Unlocks performance-critical scenarios with thousands of blocks. But requires giving up text selection, accessibility, find-in-page.
**Effort:** L | **Priority:** P3
**Depends on:** Stable layout layer, clear use case demand
**Note:** Codex review called this "architecture tourism" for v1. Build only if a real user needs it.
