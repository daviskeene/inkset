# Transform

The transform layer turns the raw AST into an **enriched AST**: nodes annotated with everything the renderer and measure layer will need later.

## The plugin contract

Every plugin registers the AST node types it handles and transforms them.

```ts
interface InksetPlugin {
  name: string;
  key?: string;
  handles: string[];
  canHandle?(node: ASTNode): boolean;
  widthSensitive?: boolean;
  preload?(): Promise<void>;
  transform(node: ASTNode, context: PluginContext): EnrichedNode;
  measure?(node: EnrichedNode, maxWidth: number): Dimensions;
  component: React.ComponentType<PluginComponentProps>;
}
```

- `handles` lists the AST node types the plugin wants.
- `transform` runs synchronously for matching nodes. The output carries the data the plugin will need at render time.
- `measure` is called by the measure layer if the plugin's content isn't plain text.
- `component` is the React component that renders the block.

## Dependency order

Plugins run in registration order, but there is one important wrinkle.

- If a plugin with `canHandle()` claims a node, it runs exclusively.
- If no guarded plugin claims the node, unguarded plugins chain in order.

This is how `@inkset/diagram` can take Mermaid fences while `@inkset/code` still handles every other code block.

## Width-sensitive transforms

Most transforms only need to run when content changes. Some plugins care about width too. Those can set `widthSensitive: true`, which lets Inkset re-run their transform step during relayout.

## See also

- [Writing a plugin](/docs/writing-plugins) — end-to-end plugin walkthrough.
- [Measure](/docs/measure) — how enriched nodes become dimensions.
