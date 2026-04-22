Sure — here's the round-trip for a typical chat completion, from keystroke to rendered response:

```mermaid
sequenceDiagram
  participant U as User
  participant C as Chat UI
  participant A as API
  participant M as Model
  U->>C: types prompt
  C->>A: POST /messages (stream: true)
  A->>M: forward prompt
  M-->>A: token stream
  A-->>C: SSE chunks
  C-->>U: render as tokens arrive
  M->>A: [DONE]
  A->>C: close stream
  C->>U: finalize block
```

The UI renders each chunk the moment it arrives. Inkset measures the block once via pretext, then lays out with arithmetic, so the mid-stream reflow cost stays near zero.

And here's a rougher state view of what the UI is actually tracking per message:

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Streaming: user submits
  Streaming --> Streaming: token arrives
  Streaming --> Settled: stream closes
  Streaming --> Error: network/parse failure
  Error --> Idle: retry
  Settled --> Idle: new turn
```

Every ` ```mermaid ` fence gets promoted to a real SVG diagram. The mermaid library is dynamic-imported on the first diagram seen, so your base bundle stays lean if your app never emits one.
