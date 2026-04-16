# Inkset: Composable Text Rendering for Model Responses

## Vision

Inkset is a composable rendering engine for LLM output that combines **pretext**'s DOM-free text measurement with rich content rendering (markdown, math, syntax highlighting, diagrams) in a streaming-first, framework-agnostic architecture.

The core insight: every chat UI today renders model responses into a fixed-width container and hopes the browser handles the rest. Code blocks overflow on mobile. Math expressions break layouts. Long responses cause layout thrashing as the DOM reflows on every token. Pretext proved that text layout can be 300-600x faster outside the DOM — inkset extends that insight to rich content.

**v1 scope (post-CEO review):** v1 is a React component for streaming LLM output with pretext-powered responsive layout. Not a universal content platform. Prove the thesis, expand later. Framework-agnostic extraction is a v2 goal.

---

## Problem Statement

### What exists today

| Tool | Does well | Doesn't do |
|------|-----------|------------|
| **Pretext** | DOM-free text measurement, variable-width reflow, obstacle-aware layout, shrinkwrap | Rich content (markdown, code, math). Plain text only. |
| **Streamdown** | Streaming markdown, composable plugins, incomplete syntax repair | Responsive reflow. React-only. Tailwind-dependent. No layout control. |
| **react-markdown** | Mature plugin ecosystem (remark/rehype) | Streaming. Performance. Layout. |
| **llm-ui** | Frame-rate-matched rendering, custom blocks | No layout engine. React-only. |
| **streaming-markdown** | Incremental DOM append, tiny bundle | No plugins. No math. No layout. Vanilla JS only. |

### The gap

No tool combines:
1. **Pretext-powered layout** — text measurement and reflow without DOM thrashing
2. **Rich content rendering** — markdown, LaTeX math, syntax highlighting, diagrams
3. **Streaming-first architecture** — handles incomplete syntax, incremental updates, block-level memoization
4. **Framework-agnostic core** — works with React, Vue, Svelte, vanilla JS, or server-side
5. **Composable plugin system** — add only what you need, extend with custom renderers

---

## Architecture

### Design Principles

1. **Pretext is the layout engine, not a utility.** Every content block flows through pretext for measurement and positioning. The DOM is a render target, not a layout source.
2. **Parse once, layout many.** Mirrors pretext's `prepare()`/`layout()` split: parse markdown once, re-layout on resize with pure arithmetic.
3. **Plugins are the product.** The core is a pipeline coordinator. All content rendering (code, math, diagrams) lives in plugins. The core ships nothing you don't import.
4. **Stream-native, not stream-adapted.** Incomplete syntax handling, incremental block updates, and partial content rendering are first-class concerns — not afterthoughts bolted onto a batch renderer.
5. **Framework-agnostic core, framework-specific adapters.** The parsing/layout/measurement layer is pure TypeScript. React/Vue/Svelte bindings are thin adapter packages.
6. **Zero opinions on styling.** No Tailwind dependency. No design tokens. Ship unstyled. Provide CSS custom properties for theming.

### System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     LLM Token Stream                    │
└──────────────────────────┬──────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │   Ingest    │  Accumulate tokens, detect block boundaries
                    │   Layer     │  Auto-complete incomplete syntax (remend-style)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Parse     │  Markdown → AST (block-level tokenization)
                    │   Layer     │  Incremental: only re-parse changed/new blocks
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Transform  │  AST → enriched AST via plugins
                    │   Layer     │  Math, code, diagrams, custom renderers
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Measure    │  pretext prepare() for each text segment
                    │   Layer     │  Cache prepared handles across re-renders
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Layout    │  pretext layout() with container width
                    │   Layer     │  Variable-width reflow, obstacle avoidance
                    │             │  Pure arithmetic — runs on every resize
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Render    │  Layout tree → target output
                    │   Layer     │  DOM, Canvas, SSR, or custom target
                    └──────┘──────┘
```

### Layer Details

#### 1. Ingest Layer
- Accumulates streaming tokens into a growing document string
- Detects block boundaries (paragraph breaks, code fence open/close, heading markers)
- Runs incomplete syntax repair: auto-closes unterminated `**bold**`, `` `code` ``, `[links]()`, `$$math$$`, code fences
- Emits block-level change events: `block:append`, `block:complete`, `block:new`
- **Key insight from Streamdown**: repair at the string level *before* parsing, not after

#### 2. Parse Layer
- Tokenizes markdown into block-level AST nodes
- **Incremental**: maintains a block index. When new tokens arrive, only the last (incomplete) block is re-parsed. Completed blocks are frozen.
- Supports GFM extensions: tables, task lists, strikethrough, footnotes, autolinks
- Block types: `paragraph`, `heading`, `code`, `math-display`, `table`, `list`, `blockquote`, `html`, `thematic-break`, `diagram`
- **Parser choice**: use `marked.lexer()` for block tokenization (fast, proven), then a custom inline parser that is incremental-aware

#### 3. Transform Layer (Plugin System)
- Each plugin registers for specific AST node types and transforms them
- Plugins run in dependency-ordered sequence
- Plugin interface:

```typescript
interface InksetPlugin {
  name: string;
  // Which AST node types this plugin handles
  handles: string[];
  // Transform AST node → enriched node with rendering data
  transform(node: ASTNode, context: PluginContext): EnrichedNode;
  // Measure the rendered dimensions of the enriched content
  // Returns { width, height } or delegates to pretext for text segments
  measure?(node: EnrichedNode, maxWidth: number): Dimensions;
  // Render the enriched node to the target
  render?(node: EnrichedNode, target: RenderTarget): void;
}
```

- **Built-in plugins (separate packages)**:
  - `@inkset/code` — Shiki-based syntax highlighting with streaming support (shiki-stream)
  - `@inkset/math` — KaTeX rendering, supports `$`, `$$`, `\(`, `\[` delimiters with normalization
  - `@inkset/mermaid` — Mermaid diagram rendering with strict security
  - `@inkset/table` — Responsive table rendering with horizontal scroll
  - `@inkset/cjk` — CJK text handling and line breaking rules

#### 4. Measure Layer
- Calls `pretext.prepare()` for each text segment in the enriched AST
- Caches prepared handles keyed by `(text, font, options)` — never re-prepares unchanged text
- For non-text content (code blocks, math, diagrams), plugins provide their own measurement
- For mixed-font inline content (bold, italic, code spans), uses pretext's `prepareRichInline()`
- **Critical optimization**: prepare() is expensive (~2ms per text block). Only run it for new/changed blocks. Cache aggressively.

#### 5. Layout Layer
- Calls `pretext.layout(prepared, containerWidth, lineHeight)` for each measured block
- Computes vertical positions: each block's y-offset = previous block's y-offset + height + margin
- Supports variable-width layouts via `layoutNextLine()`:
  - Text flowing around inline images
  - Multi-column layouts
  - Obstacle-aware reflow for floating elements
- **The hot path**: on window resize, only this layer runs. Everything above is cached. ~0.0002ms per block means thousands of blocks reflow in under 1ms.
- Outputs a `LayoutTree`: flat array of positioned blocks with `{ x, y, width, height, content }` for each

#### 6. Render Layer
- Consumes `LayoutTree` and renders to a target
- **DOM renderer** (default): positions blocks with `transform: translate()` — no reflow, no layout thrashing
  - Uses `position: absolute` on each block within a relative container
  - Only updates transforms on resize (no DOM structure changes)
  - Plugins render their content into each block's DOM node
- **Canvas renderer**: for performance-critical scenarios (thousands of blocks)
- **SSR renderer**: generates static HTML with computed heights for initial page load
- **Framework adapters**:
  - `@inkset/react` — React component with hooks (`useInkset`, `useStreamingInkset`)
  - `@inkset/vue` — Vue composable
  - `@inkset/svelte` — Svelte action
  - `@inkset/vanilla` — Vanilla JS imperative API

### Streaming Pipeline

```
Token arrives → Ingest appends to document
             → Ingest detects if current block changed or new block started
             → Parse re-tokenizes only the affected block(s)
             → Transform runs plugins on changed blocks only
             → Measure calls prepare() only for new/changed text segments
             → Layout runs for ALL blocks (but this is ~0.0002ms each)
             → Render updates only changed blocks in the DOM
```

**Performance budget per token arrival**: < 2ms total (targeting 500+ tokens/sec rendering)

### Block-Level Memoization Strategy

Following Streamdown's proven approach but with pretext-aware enhancements:

1. Each block gets a stable identity (index-based, not content-hash)
2. Blocks track their `preparedHandle` from pretext — reused across re-renders
3. Only the last block (actively receiving tokens) is "hot" — all others are frozen
4. When a block completes (next block starts), it transitions to frozen state:
   - Its prepared handle is final
   - Its plugin transforms are final
   - Only layout() re-runs on resize
5. React adapter: each block is `React.memo` with custom comparator checking content equality

---

## Plugin Architecture Deep Dive

### Plugin Lifecycle

```
1. register()  — plugin declares which node types it handles
2. transform() — called when a matching node enters the pipeline
3. measure()   — called when the layout engine needs dimensions
4. render()    — called when the render layer needs to output content
5. destroy()   — called when a block is removed (cleanup resources)
```

### Math Plugin (`@inkset/math`)

**The dollar sign problem**: LLMs inconsistently use `$`, `$$`, `\(`, `\[` for math delimiters. Models mix math and currency (`$50`) in the same response. No regex perfectly disambiguates.

**Inkset's approach**:
1. **Delimiter normalization** in the Ingest layer: convert `\(` → `$`, `\[` → `$$` before parsing
2. **Heuristic disambiguation**: `$` followed by digits and no closing `$` within the same line → treat as currency, not math
3. **KaTeX rendering** with error boundaries: invalid LaTeX renders as raw text with a subtle error indicator, not a red error box
4. **Streaming math**: incomplete `$$...` blocks show a skeleton placeholder until the closing delimiter arrives
5. **Measurement**: KaTeX renders to an off-screen element, then the bounding box is measured and reported to the layout engine. Cached by expression text.

### Code Plugin (`@inkset/code`)

**Approach**: Shiki with `shiki-stream` for incremental highlighting.

1. **Language detection**: from code fence language tag (` ```python `). If absent, use highlight.js's `highlightAuto()` after the first 3 lines arrive.
2. **Streaming highlighting**: pipe tokens through `CodeToTokenTransformStream`. Handle recalls for retroactive correction.
3. **Measurement**: code blocks have fixed-width characters. Measure the longest line with pretext, add padding. Height = line count * line height.
4. **Responsive code blocks**: if the code block width exceeds container width, enable horizontal scroll. Never break code lines.
5. **Copy button**: extract raw text content, not highlighted HTML. Visual feedback on copy.
6. **Line numbers**: optional, off by default. Computed from the token stream.

### Custom Renderers

Following Streamdown's pattern, custom renderers let consumers handle arbitrary code fence languages:

```typescript
const vegaPlugin: InksetPlugin = {
  name: 'vega-lite',
  handles: ['code:vega', 'code:vega-lite'],
  transform(node) {
    return { ...node, spec: JSON.parse(node.content) };
  },
  measure(node, maxWidth) {
    return { width: maxWidth, height: 400 }; // fixed chart height
  },
  render(node, target) {
    vegaEmbed(target.element, node.spec);
  }
};
```

---

## Responsive Layout: The Killer Feature

### Why This Matters

Every chat UI today does this:
```css
.message { max-width: 48rem; }
pre { overflow-x: auto; }
```

This is the bare minimum. It doesn't solve:
- Text that could be better balanced across lines
- Code blocks that are 2 characters wider than the container, forcing a scrollbar
- Math expressions that overflow on mobile
- Tables that are unreadable at narrow widths
- Mixed content (text + code + math) where each block has different ideal widths

### What Inkset Enables

**Adaptive text balancing**: Use pretext's `walkLineRanges()` + `measureLineStats()` to find the tightest width that keeps the same line count. Text blocks automatically balance without CSS `text-wrap: balance` (which has limited browser support and no JS API).

**Width-aware code blocks**: Measure the longest code line with pretext. If it fits within the container, render inline. If not, offer options:
- Horizontal scroll (current standard)
- Soft-wrap with indentation markers (configurable)
- Collapsed view with expand-on-click

**Obstacle-aware text flow**: Using pretext's `layoutNextLine()`, text can flow around:
- Inline images and figures
- Floating tool-use result cards
- Citation panels
- User avatars in conversation layouts

**Responsive math**: Measure KaTeX output width. If it exceeds the container, automatically switch from inline to display mode, or scale down with a CSS transform.

**Virtualized long responses**: Since pretext computes exact heights for all blocks without DOM measurement, virtual windowing becomes trivial. Only mount blocks visible in the viewport. Scroll position is pixel-accurate because heights are known, not estimated.

---

## Package Structure

```
inkset/
├── packages/
│   ├── core/              # Parser, plugin system, layout engine
│   │   ├── src/
│   │   │   ├── ingest.ts          # Token accumulation, syntax repair
│   │   │   ├── parse.ts           # Block-level markdown tokenization
│   │   │   ├── transform.ts       # Plugin pipeline coordinator
│   │   │   ├── measure.ts         # Pretext integration, measurement cache
│   │   │   ├── layout.ts          # Layout computation, positioning
│   │   │   ├── render.ts          # Render target abstraction
│   │   │   ├── plugin.ts          # Plugin interface and registry
│   │   │   ├── stream.ts          # Streaming orchestrator
│   │   │   └── types.ts           # Shared type definitions
│   │   └── package.json
│   ├── code/               # @inkset/code — Shiki syntax highlighting
│   ├── math/               # @inkset/math — KaTeX math rendering
│   ├── mermaid/            # @inkset/mermaid — diagram rendering
│   ├── table/              # @inkset/table — responsive tables
│   ├── cjk/                # @inkset/cjk — CJK text handling
│   ├── react/              # @inkset/react — React adapter
│   ├── vue/                # @inkset/vue — Vue adapter
│   └── svelte/             # @inkset/svelte — Svelte adapter
├── apps/
│   ├── docs/               # Documentation site
│   ├── playground/         # Interactive demo / playground
│   └── benchmark/          # Performance benchmarks vs. alternatives
├── docs/
│   └── PLAN.md             # This file
└── package.json            # Monorepo root (pnpm workspaces + turborepo)
```

---

## Differentiation from Streamdown

| Dimension | Streamdown | Inkset |
|-----------|------------|----------|
| **Layout engine** | None (browser CSS) | Pretext — DOM-free measurement and reflow |
| **Resize performance** | Full DOM reflow | ~0.0002ms arithmetic per block |
| **Framework** | React only | Framework-agnostic core + adapters |
| **Styling** | Tailwind + shadcn required | Unstyled, CSS custom properties |
| **Text balancing** | None | Automatic via pretext shrinkwrap |
| **Variable-width layout** | None | Per-line width control, obstacle reflow |
| **Virtual scrolling** | Requires height estimation | Pixel-accurate heights from pretext |
| **Code block overflow** | `overflow-x: auto` | Width-aware: inline, scroll, or wrap |
| **SSR** | React SSR | Pretext SSR (when available) + static HTML |
| **Plugin interface** | Separate npm packages, React context | Universal plugins with measure/render hooks |
| **Streaming repair** | remend (string-level) | Similar approach, ingest layer |
| **Bundle** | Heavy (mermaid in core) | Tree-shakeable, import only what you use |

---

## Implementation Phases (Revised post-CEO review)

### Phase 1: Core Pipeline + React Adapter (Weeks 1-3)
- Ingest layer with streaming token accumulation and syntax repair
- Parse layer: marked.lexer() for block splitting, unified/remark per block
- Plugin system with transform/measure/render lifecycle
- Pretext integration: measure layer with global LRU cache
- Layout layer with vertical block stacking (absolute positioning)
- DOM render target
- **@inkset/react** — `<Inkset>` component, `useInkset()` hooks
- Security foundations (rehype-sanitize, plugin boundary safety)
- Accessibility foundations (reading order, focus management, ARIA)
- Progressive enhancement architecture

### Phase 2: Essential Plugins + Playground (Weeks 3-5)
- `@inkset/code` — Shiki + shiki-stream highlighting
- `@inkset/math` — KaTeX with delimiter normalization
- `@inkset/table` — Responsive tables
- Streaming orchestrator: block-level memoization
- Smart Content-Aware Copy (plugin-specific clipboard hooks)
- **Interactive Playground** — thesis validation, resize demo, metrics
- Custom text selection support (across absolute-positioned blocks)

### Phase 3: Responsive Layout (Weeks 5-7)
- Width-aware code blocks (adaptive scroll/wrap/inline)
- Content-aware responsive math (inline/display/scale)
- Virtual scrolling with pixel-accurate heights
- Text balancing via pretext shrinkwrap

### Phase 4: Polish + Ecosystem (Weeks 7-10)
- Streaming performance dashboard (DevTools overlay)
- `@inkset/mermaid` — diagram rendering
- `@inkset/cjk` — CJK text handling
- Documentation site
- Find-in-page support for absolute-positioned content
- Full accessibility audit

---

## Technical Risks

1. **Pretext doesn't handle rich content.** Pretext measures plain text. Rich content (bold, italic, code spans, math inline) requires `prepareRichInline()` which handles mixed fonts, but not arbitrary inline HTML. We may need to extend pretext's model or build a measurement shim for complex inline content.

2. **Pretext's prepare() cost for streaming.** At ~2ms per text block, prepare() on every token for the active block could bottleneck at high token rates. Mitigation: debounce prepare() during streaming, only run on idle frames or after N tokens accumulate. Use layout() with the previous prepared handle as a best-effort approximation until the new prepare() completes.

3. **No pretext SSR.** Pretext requires Canvas. For SSR, we'd need to either: (a) wait for pretext's `setMeasureContext` API (issue #126), (b) use `node-canvas` or similar on the server, or (c) ship estimated heights for SSR and hydrate with exact heights on the client (layout shift risk).

4. **Plugin measurement for non-text content.** KaTeX and Mermaid render to DOM/SVG, which means we need DOM for their measurement. This partially defeats the "DOM-free measurement" story. Mitigation: cache measurements aggressively, measure off-screen, and only re-measure when content changes.

5. **Ecosystem adoption.** Streamdown has 22M npm downloads and Vercel's backing. Inkset needs a compelling demo and clear DX win to attract adoption. The responsive layout story is the wedge — show something no other tool can do.

---

## Success Criteria

1. **Performance**: Render 1000 blocks with resize in < 1ms layout time (pretext arithmetic only). Full pipeline (parse + transform + measure + layout + render) < 16ms per frame during streaming.
2. **Bundle size**: Core < 15KB gzipped. Each plugin < 10KB gzipped (excluding heavy dependencies like Shiki/KaTeX).
3. **Streaming**: Handle 200+ tokens/sec with no visible jitter, no layout thrashing, no dropped frames.
4. **Responsive**: Text reflows smoothly on window resize with no DOM measurement. Code blocks adapt to container width. Math expressions scale on mobile.
5. **Developer experience**: `npm install @inkset/core @inkset/react @inkset/code @inkset/math` and render streaming LLM output in < 20 lines of code.
6. **Framework-agnostic**: Same core works with React, Vue, Svelte, and vanilla JS.

---

## Resolved Questions (CEO Review, 2026-04-15)

1. **Parser:** Use marked.lexer() for block splitting, then full unified/remark pipeline (remark-parse + remark-gfm + remark-rehype) per block. Inkset innovates at measurement/layout, not parsing.
2. **Unmeasurable content:** Placeholder with lazy measurement. Allocate default height, render off-screen, measure actual dimensions, update layout. Accept one layout shift per unmeasurable block.
3. **React API:** Ship `<Inkset>` component (Streamdown-like) AND `useInkset()` / `useInksetLayout()` hooks for advanced use cases.
4. **Cache strategy:** Global LRU (500 entries) for pretext prepare() handles.
5. **Rendering model:** Full absolute positioning. Build custom text selection and find-in-page support.
6. **Phase sequencing:** React in Phase 1 (not Phase 3). Playground in Phase 2. Security/accessibility foundations in Phase 1.
7. **Test infrastructure:** Vitest + Playwright from day 1.

## Open Questions

1. What's the right boundary between inkset and pretext? Should inkset contribute upstream or maintain shims? Defer until v1 reveals needs.

---

## Competitive Landscape Summary

**Direct competitors**: Streamdown (Vercel), llm-ui, streaming-markdown
**Adjacent tools**: react-markdown, marked, markdown-it, remark/rehype ecosystem
**Layout innovation**: Pretext (Cheng Lou / Midjourney)
**Inkset's moat**: The intersection of pretext-powered layout + rich content plugins + streaming + framework-agnostic architecture. Nobody else is building this.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | 8 proposals, 6 accepted, 2 deferred. v1 narrowed. 5 cross-model tensions resolved. |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 20+ issues. Key: narrow scope, React first, security/a11y Phase 1. |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 4 issues resolved: plugin render model, font loading, width-sensitive flag, incremental lexing. 0 critical gaps. |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | -- | -- |

**VERDICT:** CEO + ENG CLEARED. Ready to implement.
