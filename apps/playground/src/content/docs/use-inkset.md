# useInkset()

A hook for pushing tokens into Inkset imperatively. Use it when you're reading from an `AsyncIterable`, a `ReadableStream`, or any source that doesn't give you the full markdown string at once.

## Basic shape

```tsx
import { useInkset } from "@inkset/react";
import { createCodePlugin } from "@inkset/code";

export function StreamingMessage() {
  const { containerRef, appendToken, endStream, reset } = useInkset({
    plugins: [createCodePlugin()],
  });

  // appendToken(str) — push a chunk.
  // endStream() — signal end-of-stream; the hot block freezes.
  // reset() — clear everything and start over.

  return <div ref={containerRef} />;
}
```

## Wiring an LLM stream

```tsx
useEffect(() => {
  const ac = new AbortController();
  (async () => {
    const res = await fetch("/api/chat", { signal: ac.signal });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      appendToken(decoder.decode(value, { stream: true }));
    }
    endStream();
  })();
  return () => ac.abort();
}, [appendToken, endStream]);
```

## Options

The hook takes the same configuration as the [`<Inkset>` component](/docs/component), minus `content` and `streaming` — you control those through `appendToken` and `endStream`.

## When to prefer the hook

- You don't have the full markdown string in React state.
- You want to drive the render from outside React (e.g. a Redux store, a Zustand subscription).
- You need to reset mid-stream in response to a user action.

## See also

- [Streaming from an LLM](/docs/streaming) — end-to-end example wiring an API route through this hook.
