Inkset is an open source React library that renders streaming LLM output quickly, including Markdown, code, math, tables, diagrams, and generative UI components. It's built on [Pretext](https://github.com/chenglou/pretext) for efficient and responsive chat UIs, ships in a much smaller package than what you're probably using today, and is already running in production-grade software.

## Why Inkset

When an LLM response streams in, the browser lays out the page again on every update, and anything that reads an element's size, like auto-scroll, forces it to re-calculate that work immediately. For dynamic interfaces like AI Chat, this becomes really expensive, and causes slow/laggy behavior as user chat history grows (along with the complexity of what is actually being rendered). To fix this, Inkset uses Pretext, a new tool that can measure where text is supposed to go based almost entirely on what computers are already really good at: arithmetic.

The result is a lightweight, drop-in replacement for your current rendering stack that is built with performance in mind. It's also great at handling inline math & code snippets. Inkset primarily exists to ensure that a model's intelligence can be properly expressed on the web.

## What it renders

Code blocks come with syntax highlighting:

```typescript
const fib = (n: number): number => {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
};

fib(10); // 55
```

Math renders with KaTeX:

$$
\int_0^\infty \frac{x^2}{e^x} dx = 2
$$

Tables work too:

| Name        | Age (Years) |
| ----------- | ----------- |
| Inkset      | 0\*         |
| Davis Keene | 25          |

> \*just born!

And so do Mermaid diagrams:

```mermaid
graph LR
    A[Model stream] --> B[Inkset] --> C[Your chat UI]
```

Install it with:

```bash
npm install @inkset/core @inkset/react
```

Then drop `<Inkset />` into your chat UI, or ask your coding agent to set it up for you. The controls above switch themes, toggle plugins, and run the stream demos, and the [docs](/docs/introduction) cover the rest. For anything else, [get in touch](https://daviskeene.com).
