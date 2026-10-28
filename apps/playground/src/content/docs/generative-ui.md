# Generative UI

A model can answer with interactive components as well as text. Examples are a calculator for a loan question, a comparison table that the user can sort, or a form that collects the data an agent needs. Inkset renders this type of answer as one message: the Markdown streams through the usual pipeline, and your components show between the paragraphs and keep their state while more text arrives.

## How Inkset renders it

Inkset divides a message into an ordered list of parts:

- A **Markdown part** is text. It gets the full Inkset pipeline: incremental parsing, Pretext measurement, and frozen blocks that stay in place while tokens arrive.
- A **surface part** is one of your components. It renders in normal document flow between the Markdown parts, with an ID that you give it.

Surfaces do not go into the absolute layout, because the absolute layout does not work well for interactive content:

- A component changes size when the user interacts with it. In the absolute layout, it would cover the text below it until Inkset updated the layout one frame later.
- The message element would clip the component's menus and popovers, or position them relative to the block instead of the window.
- The message is a live region for screen readers, so screen readers would announce each value that the component shows.

In normal flow, the browser lays out the components, and Inkset lays out the text.

## Add generative UI to your model's output

First, decide what the model can show. This is your **catalog**: a list of the components that you permit and the props that each one accepts. The components are yours and use your styles. The model only selects from the list and gives the props.

Then, tell the model about the catalog. You can do this in one of two ways:

- Describe the catalog in the system prompt and let the model write a spec. [json-render](https://json-render.dev) can generate this prompt for you.
- Give the model one tool for each component. The tool arguments are the component props.

Send the UI as a separate message part, such as a tool call or a data part, and not as JSON inside the text. Then your app does not need to find the JSON in a paragraph that is still streaming. If your model sends text and UI in one stream, split them before you render. json-render has helpers for this.

With all transports, a response becomes an ordered list of text and UI. Map the list to Inkset parts in the same order:

```ts
import type { InksetPart } from "@inkset/react";

type TextPart = { type: "text"; text: string };
type UiPart = { type: "ui"; id: string; spec: Spec };
type ResponsePart = TextPart | UiPart;

const toParts = (messageId: string, parts: ResponsePart[], streaming: boolean) =>
  parts.map(
    (part, index): InksetPart<Spec> =>
      part.type === "text"
        ? {
            id: `${messageId}:${index}`,
            type: "markdown",
            content: part.text,
            streaming: streaming && index === parts.length - 1,
          }
        : { id: part.id, type: "surface", data: part.spec },
  );
```

A text part can use its position as its ID, because a response only gets longer. A component must keep the ID that the model gave it, and the ID must be unique in the conversation. Then a later update with the same ID goes to the component that is already on the screen.

## Render the parts

`InksetParts` takes the parts in order, and a function that renders your component for each surface part:

```tsx
import { InksetParts } from "@inkset/react";

<InksetParts
  parts={toParts(message.id, message.parts, isStreaming)}
  renderSurface={(part) => <Surface id={part.id} spec={part.data} />}
  plugins={plugins}
/>;
```

All Markdown parts share the other props, such as `plugins`, `theme`, `font`, and `reveal`, as they would on `<Inkset>`. `className` and `style` apply to the wrapper, which is a flex column. The gap between parts is the same as your default block spacing. `data` can be any value. Its type goes through to `renderSurface`, and Inkset does not read it.

Inkset does these things for you:

- **Identity.** A part keeps its component instance while its `id` stays the same. When you add, remove, or move other parts, the component does not mount again. A new `data` value also does not mount it again, so text that the user typed, control positions, and focus stay as they are.
- **Placement.** Components are in normal flow. When a component gets taller, the text below it moves in the same frame and is never covered.
- **Accessibility.** Components render outside the live regions and the reveal wrappers of the Markdown parts. Their controls stay focusable, and screen readers do not announce their changes as part of the stream.
- **Streaming.** Each Markdown part streams on its own. The text after a component can continue to arrive while the user operates the component.

Your app does these things:

- It keeps the state of each component. Inkset does not read this state.
- It decides how an update from the model merges with changes that the user made.
- It decides what a button does. A component must not start an action only because it renders.

## Keep user state through updates

A model can change a component after it is on the screen, later in the same answer or in reply to a follow-up question. Send a new spec with the same part ID, and Inkset updates the component in place.

The user's input stays only if the component keeps its state outside the spec. When a new spec arrives, apply only the values that the user did not change.

With json-render, create one store for each surface when its first spec arrives, and pass it to `JSONUIProvider` as `store`. In this controlled mode, a later spec does not reset the values that the user set.

```tsx
import { createStateStore, type Spec, type StateStore } from "@json-render/core";
import { JSONUIProvider, Renderer } from "@json-render/react";

const sessions = new Map<string, { store: StateStore; touched: Set<string> }>();

// Call this whenever a spec arrives for a surface, before rendering it.
const receiveSpec = (id: string, spec: Spec) => {
  const session = sessions.get(id);
  if (!session) {
    const store = createStateStore(spec.state ?? {});
    sessions.set(id, { store, touched: new Set() });
    return;
  }
  const untouched: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(spec.state ?? {})) {
    if (!session.touched.has(`/${key}`)) untouched[`/${key}`] = value;
  }
  session.store.update(untouched);
};

const Surface = ({ id, spec }: { id: string; spec: Spec }) => (
  <JSONUIProvider registry={catalog} store={sessions.get(id)!.store}>
    <Renderer registry={catalog} spec={spec} />
  </JSONUIProvider>
);
```

Your catalog components add a path to `touched` each time the user writes to it.

If you use json-render's `useJsonRenderMessage`, it gives the text and the spec separately, without their original order. Build the parts from the message parts directly instead.

## Example: a gear explorer

This example shows the full flow. The user asks how bike gears work. The answer has a paragraph, an interactive gear explorer, and a second paragraph that explains how to read the explorer.

<!-- docs-example:generative-ui -->

The example replays a recorded conversation, so it does not need an API key. The model's answer is Markdown and a json-render spec from a catalog of six components, and Inkset renders both as one message.

Change the gears while the answer streams. Then ask the follow-up question: the model adds a climbing gear to the explorer, and your settings stay the same. Under each answer, "What the model sent" shows the raw output. The full-page version is at [/generative-ui](/generative-ui), and the source is in [`apps/playground/src/app/generative-ui`](https://github.com/daviskeene/inkset/tree/main/apps/playground/src/app/generative-ui).

## Tradeoffs

- **Inkset does not measure your components.** Pretext measures text, and it cannot know the height of a React component before the component mounts. If you know the size of a component, reserve the space with CSS, such as `aspect-ratio` or `min-height`. Then the text below does not move when the component loads.
- **Each Markdown part is a separate document.** A footnote or a reference link cannot connect across a component.
- **The browser controls scroll anchoring.** When content above the reader changes size, the browser keeps the reader's position if the full change is above the viewport. If the reader can see the edge of a component that gets taller, the text below it moves down. If your app needs more control, manage the scroll position in your own scroll container.
- **Model output is untrusted input.** Render only components from your catalog. Validate props as you validate user input, and keep side effects in handlers that your app owns.
