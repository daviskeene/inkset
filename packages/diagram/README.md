# @inkset/diagram

Mermaid diagram plugin for Inkset.

## Install

```bash
npm install @inkset/diagram mermaid
```

## Usage

```tsx
import { Inkset } from "@inkset/react";
import { createDiagramPlugin } from "@inkset/diagram";

const plugins = [createDiagramPlugin({ theme: "neutral" })];

export const Example = ({ content }: { content: string }) => {
  return <Inkset content={content} plugins={plugins} />;
};
```

`@inkset/diagram` handles Mermaid fenced code blocks and renders them as measured diagram blocks inside the Inkset layout pipeline.
