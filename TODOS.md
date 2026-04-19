# Inkset TODOS

> v1 launch scope (benchmark site, @inkset/vercel-ai, launch blog post, inkset.dev) tracked in the CEO plan at `~/.gstack/projects/daviskeene-preframe/ceo-plans/2026-04-16-inkset-launch-strategy.md`.

## Post-Launch (Backlog)

### Side-by-side Demo Video

**What:** 60-second screen recording comparing streamdown vs inkset resize behavior on a long streaming response. Visible cursor lag on one side, smooth reflow on the other.
**Why:** Shareable asset for X/HN. The visual story in 10 seconds. Deferred from launch scope — produce once there's enough user interest to signal the effort is worth it.
**Effort:** S (human: 1-2 days / CC: ~4 hours) | **Priority:** P2
**Depends on:** Playground with reproducible streaming scenes (already built).

### @inkset/streamdown-compat Shim

**What:** Thin package exposing streamdown's public API surface over inkset. One-import-line migration for existing streamdown consumers. Optional codemod for bulk migrations.
**Why:** Collapses switching cost to near-zero for streamdown's ~2.87M weekly downloads. Strategic tradeoff: reinforces "streamdown alternative" framing instead of the composability positioning, so build only if migration demand materializes after launch.
**Effort:** S-M (human: 3-5 days / CC: ~4-6 hours) | **Priority:** P3
**Depends on:** v1 launched, observed migration demand.

### Conference Talk Submissions

**What:** Submit talk proposals to JSConf, React Conf, and related venues on "Text layout outside the DOM: what we learned building Inkset."
**Why:** Multi-year amplifier for the launch blog post's narrative. 6-month lead time on submissions, so reconsider after blog post reception tells us whether the story resonates.
**Effort:** S (abstracts only) | **Priority:** P3
**Depends on:** Launch blog post published, initial reception.

## v2

### Framework-Agnostic Core Extraction

**What:** Extract core pipeline (ingest/parse/measure/layout) from the React adapter into a standalone vanilla JS package. Ship @inkset/vue and @inkset/svelte adapters.
**Why:** The v2 vision: inkset works everywhere, not just React. Enables Vue, Svelte, and vanilla JS consumers. Composability story naturally extends to framework choice too.
**Effort:** M (human) / S (CC) | **Priority:** P1 for v2
**Depends on:** Stable core API proven through React adapter usage.

### Canvas-Based Rendering Target

**What:** Alternative rendering target that uses Canvas 2D instead of DOM. For infinite canvas apps, design tools, presentation software.
**Why:** Unlocks performance-critical scenarios with thousands of blocks. But requires giving up text selection, accessibility, find-in-page.
**Effort:** L | **Priority:** P3
**Depends on:** Stable layout layer, clear use case demand.
**Note:** Prior Codex review called this "architecture tourism" for v1. Build only if a real user needs it.
