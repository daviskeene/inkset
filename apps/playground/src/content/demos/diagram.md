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

And here is the simpler per-message lifecycle the UI is really tracking:

```mermaid
flowchart LR
  Submit[User submits] --> Streaming[Streaming]
  Streaming -->|stream closes| Done[Settled]
  Streaming -->|network or parse failure| Error[Error]
  Error -->|retry| Streaming
```

Every ` ```mermaid ` fence gets promoted to a real SVG diagram. The mermaid library is dynamic-imported on the first diagram seen, so your base bundle stays lean if your app never emits one.
