# Install

Install the core package and the React package. Then add a plugin for each type of rich content that your app shows.

```bash
npm install @inkset/core @inkset/react
```

Inkset needs React 18 or 19. Each package includes its TypeScript types.

## Plugins

Each plugin is a separate package, so your bundle contains only the plugins that you install.

| Package           | What it renders                                         |
| ----------------- | ------------------------------------------------------- |
| `@inkset/code`    | Code blocks, with syntax highlighting from Shiki        |
| `@inkset/math`    | Display math and inline math, with KaTeX                |
| `@inkset/table`   | Tables that scroll horizontally, with a CSV copy button |
| `@inkset/diagram` | Mermaid diagrams, as SVG                                |

```bash
npm install @inkset/code
npm install @inkset/math katex
npm install @inkset/table
npm install @inkset/diagram mermaid
```

You must install KaTeX and Mermaid in your app yourself. The plugins import them, and Shiki, with dynamic imports, so most bundlers put them in separate chunks. Inkset loads these chunks before its first render, while it shows the loading fallback.

The math plugin also needs the KaTeX stylesheet. Import it once in your app:

```tsx
import "katex/dist/katex.min.css";
```

`@inkset/react` includes `@inkset/animate`, which controls how streaming text appears. Install `@inkset/animate` yourself only if you import from it directly. See [@inkset/animate](/docs/plugin-animate).

## Set up with a coding agent

The Inkset skill tells a coding agent how to install and configure Inkset, or how to move a project from react-markdown or Streamdown. Install it in your project:

```bash
npx skills add daviskeene/inkset
```

An agent can also read the same instructions at [inkset.dev/skill.md](/skill.md).
