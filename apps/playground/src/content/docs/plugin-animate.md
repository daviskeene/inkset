# @inkset/animate

`@inkset/animate` controls how streaming text appears on the screen. You configure it with the `reveal` prop on `<Inkset>`, and it is not a plugin in the pipeline.

`@inkset/react` includes `@inkset/animate`, so the `reveal` prop works without a separate install. Install `@inkset/animate` only if you import from it directly:

```bash
npm install @inkset/animate
```

## Usage

```tsx
import { Inkset } from "@inkset/react";

<Inkset
  content={text}
  streaming={streaming}
  reveal={{
    throttle: { delayInMs: 30, chunking: "word" },
    timeline: { durationMs: 320, stagger: 30, sep: "word" },
    css: { preset: "fadeIn" },
    shader: "ink-dither",
  }}
/>;
```

All values in this example except `shader` are the defaults. To use only the defaults, pass `reveal={{}}`.

## Example

This example streams a short sentence with the `ink-dither` shader.

<!-- docs-example:animate -->

## Reveal options

| Option      | What it does                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| `throttle`  | Holds new text in a queue and releases it at a fixed interval, one word or one character at a time.                       |
| `timeline`  | Sets how long each new word takes to appear, and the delay between words.                                                 |
| `css`       | Sets the CSS animation for new text: `"fadeIn"`, `"blurIn"`, `"slideUp"`, or the name of your own `@keyframes`.           |
| `component` | Renders each new token with your own React component, in place of the CSS animation.                                      |
| `shader`    | Draws an effect on a canvas over the new text. The text stays in the DOM for selection, find-in-page, and screen readers. |

Set an option to `false` to turn it off.

## Shaders

Inkset includes two shaders:

- **`ink-dither`** shows new text through an ordered dither pattern, and then makes it sharp.
- **`dissolve`** fades characters in from a scattered pattern.

To add your own shader, create a registry, register a loader for each shader, and pass the registry to `<Inkset>`:

```tsx
import { createShaderRegistry } from "@inkset/react";

const shaderRegistry = createShaderRegistry({ includeBuiltIns: true });
shaderRegistry.register("my-shader", () => import("./my-shader").then((mod) => mod.myShader));

<Inkset
  content={text}
  streaming={streaming}
  reveal={{ shader: "my-shader" }}
  shaderRegistry={shaderRegistry}
/>;
```

## Exports

| Export                  | What it does                                                           |
| ----------------------- | ---------------------------------------------------------------------- |
| `createTokenGate`       | Paces a stream of tokens. The `throttle` option uses it.               |
| `createShaderRegistry`  | Creates a registry for your own shaders.                               |
| `defaultShaderRegistry` | The registry with the built-in shaders. `<Inkset>` uses it by default. |

## Performance

Reveal animations add rendering work to each update. Use them where the animation is part of the product experience.
