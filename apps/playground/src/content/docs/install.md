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
npm install @inkset/math      # Display math plugin
npm install @inkset/table     # Responsive tables with CSV copy
npm install @inkset/diagram   # Mermaid diagrams
npm install @inkset/animate   # Token reveal shaders
```

## Peer dependencies

Inkset expects React 18 or newer.

Some plugins also expect peer packages:

- `@inkset/math` expects a math renderer such as `katex`
- `@inkset/diagram` expects `mermaid`

Typical installs look like this:

```bash
npm install @inkset/math katex
npm install @inkset/diagram mermaid
```

The heavy runtime pieces are lazy-loaded by the plugin, but they still need to be present in your app.

## TypeScript

Types ship with every package. No separate `@types/*` install. The public surface is typed end-to-end, including plugin authoring types.

## Next

- [Quick start](/docs/quick-start) — render your first streaming message.
- [How it works](/docs/how-it-works) — see the pipeline every block walks once.
