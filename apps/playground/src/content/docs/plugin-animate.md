# @inkset/animate

Token pacing, reveal timing, and shader garnish for streaming text.

## Install

```bash
npm install @inkset/animate
```

## Usage

`@inkset/animate` exports helpers you pass to `<Inkset>` via the `reveal` prop, rather than a plugin registered in the pipeline.

```tsx
import { Inkset } from "@inkset/react";
import { createShaderRegistry } from "@inkset/animate";

const shaderRegistry = createShaderRegistry({ includeBuiltIns: true });

<Inkset
  content={text}
  streaming={streaming}
  reveal={{
    throttle: { delayInMs: 30, chunking: "word" },
    timeline: { durationMs: 320, stagger: 30, sep: "word" },
    css: { preset: "fadeIn" },
    shader: "ink-bleed",
  }}
  shaderRegistry={shaderRegistry}
/>;
```

## Exports

| Export                  | What it does                                             |
| ----------------------- | -------------------------------------------------------- |
| `createTokenGate`       | Low-level token pacing utility used by the reveal layer. |
| `createShaderRegistry`  | Register custom shader presets for reveal overlays.      |
| `defaultShaderRegistry` | Built-in shader registry.                                |
| `wrapBlockDelta`        | Internal helper for wrapping newly revealed text ranges. |

## Built-in shaders

- **ink-bleed** — characters bleed into place like wet ink.
- **dissolve** — characters fade from a scatter pattern.

Pick one with `reveal={{ shader: "ink-bleed" }}`; pass a `ShaderRegistry` if you're authoring your own.

## When to animate

Token animations cost something. They make the most sense in product surfaces where reveal quality is part of the experience, not in every hot path by default.

## See also

- [Streaming from an LLM](/docs/streaming) — how to pair the token gate with a real stream.
