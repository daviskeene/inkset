Once the layout side is stable, the next question is simply how a streamed reply should _feel_ as it arrives.

Most chat products land in one of two places. Either the text appears immediately with no motion at all, or it arrives in strict network order, which is fine until several words show up at once and the rhythm starts to feel a little arbitrary.

Inkset's reveal layer gives you a nicer option. It can throttle the incoming stream, split the fresh text into tokens, and animate those tokens into view without giving up the layout stability underneath. The useful detail here is that the stagger does not have to follow raw arrival order. It can also follow measured **(y, x)** position, so the motion tracks reading order instead.

That is mostly just a small quality-of-life improvement, but it is a pleasant one. Real streams are bursty. A model may emit half a sentence at once, or several wrapped-line fragments in the same tick. If the reveal follows layout order, the eye keeps moving the way it already wanted to move: top to bottom, left to right, line by line.

It is a nice example of what falls out once the renderer already knows where the text goes. Motion stops feeling tacked on and starts feeling like part of the same reading experience.

```ts
reveal={{
  throttle: { delayInMs: 58, chunking: "word" },
  timeline: {
    order: "layout",
  },
  css: { preset: "blurIn" },
}}
```

The result is a little bit of motion during generation and then plain settled text once the stream is done. No replay after the fact, and no need to give up the calmer layout behavior just to get a nicer arrival rhythm.
