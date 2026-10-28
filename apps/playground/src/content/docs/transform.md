# Transform

In the transform stage, each plugin adds data to the syntax tree nodes that it handles. The measure stage and the plugin's component use this data later. [Writing a plugin](/docs/writing-plugins) shows the full plugin interface.

## Which plugin runs

A plugin lists the block types that it handles in `handles`. For each node, Inkset selects the plugins with these rules:

- If a plugin has `canHandle()` and it returns `true` for the node, only that plugin runs. If more than one plugin claims the node, the plugin that you registered first runs.
- If no plugin claims the node with `canHandle()`, the plugins without `canHandle()` run in the order that you registered them. Each plugin gets the output of the plugin before it.

For example, `@inkset/diagram` uses `canHandle()` to claim code blocks in the `mermaid` language. `@inkset/code` has no `canHandle()`, so it handles all other code blocks.

## Width-sensitive plugins

Most plugins run their transform again only when the content of a block changes. If the output of your plugin depends on the container width, set `widthSensitive: true`. Inkset then runs its transform again each time the width changes.
