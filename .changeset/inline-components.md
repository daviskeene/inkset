---
"@inkset/react": patch
"@inkset/diagram": patch
---

`<Inkset>` and `InksetParts` accept a `components` prop with the same shape as react-markdown and Streamdown, including Streamdown's `inlineCode` key. Each override receives the element's props, its rendered `children`, and its syntax-tree `node`, and a tag name works in place of a component. Overrides apply to the elements of the default renderer. Plugin-rendered blocks and reveal spans are not affected. The diagram plugin accepts a `config` option that is merged into `mermaid.initialize`, for example to set `themeVariables`. `securityLevel` stays `"strict"`. `<Inkset>` also accepts `headingTracking`, which sets heading letter-spacing for both measurement and CSS. The new `flow` prop renders every block in document flow with no fixed width, for containers that size themselves to their content, such as chat bubbles.
