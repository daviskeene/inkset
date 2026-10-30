# Stream Claude in React with the Anthropic SDK

Stream Claude replies into a React app with the Anthropic TypeScript SDK and a Next.js route handler, and render the Markdown with Inkset as it arrives.

## Install

```bash
npm install @anthropic-ai/sdk @inkset/core @inkset/react
```

Set `ANTHROPIC_API_KEY` in the environment of your server. The key stays on the server, and the browser receives only the text of the reply.

## Server route

Create `app/api/chat/route.ts`. The route starts a streamed request and sends the text of each `text_delta` event to the browser as plain text.

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function POST(request: Request) {
  const { prompt } = await request.json();

  const stream = client.beta.messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: prompt }],
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
```

With `fallbacks: "default"`, the API uses a different model for the reply if Claude Opus 5.5 declines the request. Fallbacks are part of the `server-side-fallback-2026-07-01` beta, so the route calls `client.beta.messages.stream`. To stream without fallbacks, call `client.messages.stream` and remove `betas` and `fallbacks`.

When the browser stops reading the response, `cancel()` runs and stops the request to Claude.

## Client

Create a client component that sends the prompt and adds each chunk of text to state. Set `streaming` to `true` while text arrives, and set it to `false` when the stream ends.

```tsx
"use client";

import { useState } from "react";
import { Inkset } from "@inkset/react";

export function Chat() {
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);

  async function send(prompt: string) {
    setText("");
    setStreaming(true);
    const response = await fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    });
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      setText((previous) => previous + value);
    }
    setStreaming(false);
  }

  return (
    <>
      <Inkset content={text} streaming={streaming} />
      <button onClick={() => send("Explain how a hash map works.")}>Ask</button>
    </>
  );
}
```

To render code, math, tables, and diagrams, add the [plugins](/docs/install#plugins) to `<Inkset>`.
