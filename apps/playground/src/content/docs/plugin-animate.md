# @inkset/animate

Token reveal animations. Throttle a firehose stream, split revealed text by word or character, or plug in a custom shader.

## Install

```bash
npm install @inkset/animate
```

## Usage

`@inkset/animate` exports helpers you pass to `<Inkset>` via the `reveal` prop, rather than a plugin registered in the pipeline.

```tsx
import { Inkset } from "@inkset/react";
import { createTokenGate, splitByWord } from "@inkset/animate";

const gate = createTokenGate({ rate: 60 });

<Inkset content={text} streaming={streaming} reveal={{ gate, split: splitByWord }} />;
```

## Exports

| Export                  | What it does                                                          |
| ----------------------- | --------------------------------------------------------------------- |
| `createTokenGate`       | Rate-limit and coalesce incoming tokens.                              |
| `wrapBlockDelta`        | Wrap the newly revealed portion of a block in an animation component. |
| `splitByWord`           | Split revealed text by word boundaries for word-level reveals.        |
| `splitByChar`           | Split by character for character-level reveals.                       |
| `createShaderRegistry`  | Register custom WebGL shaders for reveals.                            |
| `defaultShaderRegistry` | Ink-bleed, dissolve, and fade shaders that ship with the library.     |

## Built-in shaders

- **ink-bleed** — characters bleed into place like wet ink.
- **dissolve** — characters fade from a scatter pattern.
- **fade** — a straight opacity ramp.

Pick one with `reveal={{ shader: "ink-bleed" }}`; pass a `ShaderRegistry` if you're authoring your own.

## When to animate

Token animations are expensive. Rule of thumb: animate in static contexts (onboarding, canned demos) and turn them off on the hot path. Use a shorter `durationMs` under fast streams; use `splitByWord` rather than `splitByChar` on long responses.

## See also

- [Streaming from an LLM](/docs/streaming) — how to pair the token gate with a real stream.
