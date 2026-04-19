# Streaming from an LLM

Anthropic, OpenAI, and every other provider you've used speak some dialect of server-sent events. This page shows how to wire their streams through Inkset without fighting the pipeline.

## The simplest case

If your UI already keeps the full response in React state, `<Inkset>` is enough.

```tsx
const [text, setText] = useState("");
const [streaming, setStreaming] = useState(false);

// ...push tokens into setText; toggle streaming around the fetch...

return <Inkset content={text} streaming={streaming} plugins={plugins} />;
```

Every time `text` changes, Inkset re-parses the hot block, re-measures it, and re-lays it out. Everything above it stays frozen.

## When the stream is elsewhere

If your tokens arrive in a non-React context (a background worker, a websocket hook, a store), the low-friction option is still to bridge them back into React state and render with `<Inkset>`.

```tsx
const [text, setText] = useState("");
const [streaming, setStreaming] = useState(true);

useEffect(() => {
  const sub = chatStore.subscribe((event) => {
    if (event.type === "token") setText((prev) => prev + event.delta);
    if (event.type === "end") setStreaming(false);
  });
  return () => sub.unsubscribe();
}, []);

return <Inkset content={text} streaming={streaming} plugins={plugins} />;
```

`useInkset()` is still available for custom renderers and lower-level integrations, but it does not render Inkset's built-in DOM output by itself.

## Handling partial syntax

You don't need to. The ingest layer repairs incomplete markdown before it reaches the parser — so an unterminated code fence, a `**bold` without its closer, or a `$$` without the closing `$$` never flash through the UI.

## Interrupt mid-stream

If you keep the full response in React state, clear the string and set `streaming` back to `false`. If you are using `useInkset()`, replace the document with `setContent("")` and start a new stream session from there.

## Throttling

If your stream fires tokens faster than 60 Hz, you might want to coalesce them. The `@inkset/animate` package's token gate handles this without dropping characters. See [plugin-animate](/docs/plugin-animate).

## See also

- [useInkset()](/docs/use-inkset) — hook reference.
- [Ingest & repair](/docs/ingest) — why partial tokens don't flicker.
