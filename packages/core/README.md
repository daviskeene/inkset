# @inkset/core

Core parsing, measurement, layout, and streaming pipeline for Inkset.

## Install

```bash
npm install @inkset/core
```

## What it provides

- markdown ingest and block splitting
- AST parsing and transforms
- cached measurement via pretext
- arithmetic layout
- the streaming pipeline used by the React bindings

## Example

```ts
import { StreamingPipeline } from "@inkset/core";

const pipeline = new StreamingPipeline({
  plugins: [],
});
```

Most applications should start with [`@inkset/react`](https://github.com/daviskeene/inkset/tree/main/packages/react#readme) and reach for `@inkset/core` when building custom integrations.
