If the custom reveal component is the more typographic extension point, the shader hook is the more atmospheric one.

This is the part of the API that says Inkset does not have to stop at a few preset CSS animations. If you want something a little more cinematic or branded, you can attach an overlay that receives measured token geometry and draws around the text as it streams in.

The text itself is still normal selectable HTML. Inkset measures each new token with pretext, streams it into place, and hands the shader a packet of geometry: the token's **x**, **y**, **width**, **height**, and reveal timing. The shader draws around that. If it fails, the reply still renders correctly because the text layer never stopped being text.

That split is helpful because it keeps the responsibilities clean. Layout, accessibility, copy-paste, and selection stay reliable because the shader is not asked to own content. It only owns atmosphere.

This particular demo uses a restrained dither field so the arrival texture feels a little more technological than calligraphic. But the broader idea is just that Inkset gives you a nice place to hang custom effects once the renderer already knows where the text goes. A house-style glow, terminal noise, scanlines, particles, or something else entirely can all use the same underlying geometry.

And because the reveal order can still follow layout rather than raw network arrival, the effect tends to move in the same direction the reader's eye is already moving. It is a small touch, but it makes the whole thing feel a bit less arbitrary.

```ts
reveal={{
  throttle: { delayInMs: 63, chunking: "word" },
  timeline: { order: "layout" },
  css: { preset: "pg-reveal-dither-in" },
  shader: { source: "ink-dither" },
}}
```

The dither look here is just one expression of the capability. The useful part is simply that custom shader effects have a clean place to live.
