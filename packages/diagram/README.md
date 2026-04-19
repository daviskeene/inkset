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

It uses the core plugin system's `canHandle` gate to claim only code blocks whose language matches (default `"mermaid"`), so `@inkset/code` still owns every other language when both are registered.

## Options

- `theme` — Mermaid theme name. `"default" | "dark" | "neutral" | "forest" | "base"`. Default `"dark"`.
- `language` — language string this plugin claims. Default `"mermaid"`.
- `showHeader` — show the header bar (lang label + copy button). Default `true`.
- `showCopy` — show the copy button in the header. Default `true`.

`mermaid` is an optional peer dependency; install it alongside `@inkset/diagram`. Without it, blocks fall back to their raw source.
