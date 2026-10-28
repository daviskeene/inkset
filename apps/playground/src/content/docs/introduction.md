# Introduction

Inkset is an open source library for rendering LLM output in React. It efficiently handles streaming Markdown, code blocks, diagrams, and generative UI. You can use it in place of react-markdown or Streamdown with the same Markdown input. Its rendering engine, built on [Pretext](https://github.com/chenglou/pretext), prevents your web applications from feeling clunky or slow as chat history grows or as outputs get more complex. It also comes ready to handle animations and custom shaders, for elegant user experiences.

## Features

- **Stable streaming.** New tokens do not move the text above them, so the user can read while the answer arrives.
- **Fast resize.** On resize, Inkset calculates the new layout from cached measurements, without reading sizes from the DOM.
- **Rich content.** Plugins render code with Shiki, math with KaTeX, tables, and Mermaid diagrams. Each plugin reserves space for its block, so the text below does not jump when the block finishes rendering.
- **Generative UI.** `InksetParts` renders your own React components between parts of a Markdown answer, and the components keep their state while the text streams. See [Generative UI](/docs/generative-ui).
- **Stream animations.** The `reveal` prop paces new text and animates it with CSS or with a shader. See [@inkset/animate](/docs/plugin-animate).
- **Syntax repair.** Inkset closes unfinished Markdown, such as `**bold` without its closing marker, before it parses the text. Half-written syntax does not show on the screen.
- **Your own styles.** Inkset includes a default stylesheet that you can change with a theme or with CSS. Set `unstyled` to remove it.

To move from another renderer, see [Migration](/docs/migration).

## What makes Inkset so fast

In most chat UIs, the browser calculates the layout again after each new token. A new token can move a line before the user finishes reading it, and a resize makes the browser measure all of the text again.

Inkset divides text layout into two steps:

1. Pretext measures the text of each block with the Canvas API. This step is the expensive one, so Inkset does it once for each block and keeps the result in a cache.
2. Inkset uses the cached measurements to calculate the line breaks and the position of each block. This step is arithmetic only, so Inkset can do it again on each resize without reading from the DOM.

Inkset then fixes each finished block at the position that it calculated. Only the last block, which receives new tokens, stays in normal document flow. [How it works](/docs/how-it-works) explains the full pipeline.

## When would I use something else?

Inkset is for text that streams in or changes width while the user reads it. For static Markdown, such as a blog post, the measurement step is extra work, and react-markdown is a better fit.

Inkset has these limits:

- It supports React only.
- It renders content in the browser only, because it needs Canvas to measure text. During server rendering, `<Inkset>` shows its loading fallback.
