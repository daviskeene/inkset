# Install

Inkset ships as a small set of packages. You install the core and a framework binding, then add plugins as you need them.

## Core packages

```bash
npm install @inkset/core @inkset/react
```

`@inkset/core` is the pipeline engine: ingest, parse, measure, layout. `@inkset/react` exposes the `<Inkset>` component and `useInkset()` hook.

## Optional plugins

Install only the plugins you actually use. The rest stay out of your bundle.

```bash
npm install @inkset/code      # Shiki syntax highlighting
npm install @inkset/math      # KaTeX or MathJax rendering
npm install @inkset/table     # Responsive tables with CSV copy
npm install @inkset/diagram   # Mermaid diagrams
npm install @inkset/animate   # Token reveal shaders
```

## Peer dependencies

Inkset expects React 18 or newer. The math plugin pulls in KaTeX; the code plugin pulls in Shiki; the diagram plugin pulls in Mermaid. Each is lazy-loaded, so a page that never renders math never downloads KaTeX.

## TypeScript

Types ship with every package. No separate `@types/*` install. The public surface is typed end-to-end, including plugin authoring types.

## Next

- [Quick start](/docs/quick-start) — render your first streaming message.
- [How it works](/docs/how-it-works) — see the pipeline every block walks once.
