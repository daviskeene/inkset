# @inkset/animate

Streaming reveal primitives, timelines, and shader hooks for Inkset.

## Install

```bash
npm install @inkset/animate
```

`@inkset/animate` powers the `reveal` prop used by `@inkset/react`. It exports:

- token throttling via `createTokenGate`
- delta-aware token wrapping helpers (`wrapBlockDelta`, `splitByWord`, `splitByChar`)
- timeline and CSS reveal types (`TimelineOptions`, `CssRevealOptions`, `RevealProp`)
- shader registry helpers (`createShaderRegistry`, `defaultShaderRegistry`, `resolveShaderSource`) for custom stream effects

## Example

```ts
import { createShaderRegistry, defaultShaderRegistry } from "@inkset/animate";

// `defaultShaderRegistry` ships with the built-in presets ("ink-bleed",
// "dissolve"). Use `createShaderRegistry` directly when you want to start
// from empty, or when you're registering your own loaders in isolation.
const shaderRegistry = createShaderRegistry({ includeBuiltIns: true });
```

For end-to-end usage, see [`@inkset/react`](https://github.com/daviskeene/inkset/tree/main/packages/react#readme).
