# Streaming from an LLM

Keep the response text in React state, add each chunk to it as it arrives, and pass the text to `<Inkset>`. This works with the stream from any model provider.

## Basic example

This example reads a plain-text stream from your own API route:

```tsx
const [text, setText] = useState("");
const [streaming, setStreaming] = useState(false);

async function send(prompt: string) {
  setText("");
  setStreaming(true);
  const response = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ prompt }) });
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    setText((previous) => previous + value);
  }
  setStreaming(false);
}

return <Inkset content={text} streaming={streaming} plugins={plugins} />;
```

Each time `text` changes, Inkset parses, measures, and lays out the last block again. The blocks above it do not change.

For complete examples with a model SDK, see [Anthropic SDK](/docs/streaming-anthropic), [OpenAI SDK](/docs/streaming-openai), and [Vercel AI SDK](/docs/streaming-ai-sdk).

## Tokens from outside React

If the tokens come from a store, a WebSocket, or a worker, subscribe to the source and copy the tokens into React state:

```tsx
const [text, setText] = useState("");
const [streaming, setStreaming] = useState(true);

useEffect(() => {
  const subscription = chatStore.subscribe((event) => {
    if (event.type === "token") setText((previous) => previous + event.delta);
    if (event.type === "end") setStreaming(false);
  });
  return () => subscription.unsubscribe();
}, []);

return <Inkset content={text} streaming={streaming} plugins={plugins} />;
```

To send tokens to the pipeline directly, without React state, use [`useInkset()`](/docs/use-inkset) and its `appendToken()` function.

## Partial syntax

You do not need to handle partial syntax. Inkset closes open code fences, `$$` math blocks, and inline markers such as `**` before it parses the text. See [Ingest and repair](/docs/ingest).

## Stop a response

To stop a response, stop reading the stream and set `streaming` to `false`. To remove the message, also set the text to an empty string. With `useInkset()`, call `setContent("")`.

## Even pacing

Models often send text in bursts. To show the text at an even pace, use the `throttle` option of the `reveal` prop. It holds the text in a queue and releases it one word or one character at a time. See [@inkset/animate](/docs/plugin-animate).
