# Stream OpenAI responses in React with the OpenAI SDK

Stream replies from the OpenAI Responses API into a React app with the OpenAI TypeScript SDK and a Next.js route handler, and render the Markdown with Inkset as it arrives.

## Install

```bash
npm install openai @inkset/core @inkset/react
```

Set `OPENAI_API_KEY` in the environment of your server. The key stays on the server, and the browser receives only the text of the reply.

## Server route

Create `app/api/chat/route.ts`. The route requests a streamed response and sends the text of each `response.output_text.delta` event to the browser as plain text.

```ts
import OpenAI from "openai";

const client = new OpenAI();

export async function POST(request: Request) {
  const { prompt } = await request.json();

  const stream = await client.responses.create({
    model: "gpt-6-astra",
    input: [{ role: "user", content: prompt }],
    stream: true,
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "response.output_text.delta") {
            controller.enqueue(encoder.encode(event.delta));
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    cancel() {
      stream.controller.abort();
    },
  });

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
```

When the browser stops reading the response, `cancel()` runs and stops the request to OpenAI.

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
