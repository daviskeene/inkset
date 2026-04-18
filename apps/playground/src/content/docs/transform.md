# Transform

The transform layer turns the raw AST into an **enriched AST**: nodes annotated with everything the renderer needs — highlighted tokens for code blocks, measured glyphs for math, parsed rows for tables.

## The plugin contract

Every plugin registers the AST node types it handles and transforms them.

```ts
interface InksetPlugin {
  name: string;
  handles: string[];
  transform(node: ASTNode, context: PluginContext): EnrichedNode;
  measure?(node: EnrichedNode, maxWidth: number): Dimensions;
  component?: React.ComponentType<BlockProps>;
}
```

- `handles` lists the AST node types the plugin wants.
- `transform` runs once per matching node. The output carries any expensive data the plugin needs at render time.
- `measure` is called by the measure layer if the plugin's content isn't plain text.
- `component` is the React component that renders the block.

## Dependency order

Plugins run in the order they were registered. If two plugins claim the same node type, only the first one transforms it. Subsequent plugins can still read the enriched output.

## Async transforms

`transform` can return a promise. Inkset awaits each transform before measuring the block. A placeholder measurement is used while the transform is in flight, so streaming never stalls.

## See also

- [Writing a plugin](/docs/writing-plugins) — end-to-end plugin walkthrough.
- [Measure](/docs/measure) — how enriched nodes become dimensions.
