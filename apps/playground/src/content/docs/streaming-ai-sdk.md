# Render Vercel AI SDK chats in React

Stream a chat with the Vercel AI SDK and its useChat hook in a Next.js app, and render each assistant message as Markdown with Inkset.

## Install

```bash
npm install ai @ai-sdk/react @inkset/core @inkset/react
```

The examples use AI SDK 7 (`ai` 7 and `@ai-sdk/react` 4).

The route uses the Vercel AI Gateway, which reads `AI_GATEWAY_API_KEY` on the server. On a Vercel deployment, the gateway can use OIDC instead of a key. To call a provider directly, install its package, such as `@ai-sdk/anthropic`, and pass its model in place of the model string.

## Server route

Create `app/api/chat/route.ts`. `streamText` calls the model, `toUIMessageStream` converts the result into the message stream that `useChat` reads, and `createUIMessageStreamResponse` sends it to the browser.

```ts
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";

export async function POST(request: Request) {
  const { messages }: { messages: UIMessage[] } = await request.json();

  const result = streamText({
    model: "anthropic/claude-opus-5.5",
    messages: await convertToModelMessages(messages),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
```

## Client

`useChat` keeps the list of messages and sends each new message to `/api/chat`. Render each assistant message with its own `<Inkset>`. Only the last message can stream, so set `streaming` when the message is the last one and `status` is `"streaming"`.

```tsx
"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { Inkset } from "@inkset/react";

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat();

  return (
    <>
      {messages.map((message, index) => {
        const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");

        if (message.role === "user") return <p key={message.id}>{text}</p>;

        const isLast = index === messages.length - 1;
        return (
          <Inkset key={message.id} content={text} streaming={isLast && status === "streaming"} />
        );
      })}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          sendMessage({ text: input });
          setInput("");
        }}
      >
        <input value={input} onChange={(event) => setInput(event.currentTarget.value)} />
      </form>
    </>
  );
}
```

The example joins the `text` parts of each message. To show tool results or your own components between the text parts, use `InksetParts`. See [Generative UI](/docs/generative-ui).
