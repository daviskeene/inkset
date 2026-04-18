# @inkset/animate

Streaming reveal primitives, timelines, and shader hooks for Inkset.

## Install

```bash
npm install @inkset/animate
```

`@inkset/animate` powers the `reveal` prop used by `@inkset/react`. It exports:

- token throttling via `createTokenGate`
- delta-aware token wrapping helpers
- timeline and CSS reveal types
- shader registry helpers for custom stream effects

## Example

```ts
import { createShaderRegistry } from "@inkset/animate";

const shaderRegistry = createShaderRegistry({ includeBuiltIns: true });
```

For end-to-end usage, see [`@inkset/react`](https://github.com/daviskeene/inkset/tree/main/packages/react#readme).
