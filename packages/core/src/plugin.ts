// Plugin registry: manages plugin lifecycle, handler dispatch, and AST transformation.
import type { InksetPlugin, ASTNode, EnrichedNode, PluginContext } from "./types";

export class PluginRegistry {
  private plugins: Map<string, InksetPlugin> = new Map();
  private handlerIndex: Map<string, InksetPlugin[]> = new Map();

  register(plugin: InksetPlugin): void {
    if (this.plugins.has(plugin.name)) {
      console.warn(`[inkset] Plugin "${plugin.name}" already registered, replacing.`);
    }
    this.plugins.set(plugin.name, plugin);

    for (const nodeType of plugin.handles) {
      const handlers = this.handlerIndex.get(nodeType) ?? [];
      const filtered = handlers.filter((p) => p.name !== plugin.name);
      filtered.push(plugin);
      this.handlerIndex.set(nodeType, filtered);
    }
  }

  getHandlers(nodeType: string): readonly InksetPlugin[] {
    return this.handlerIndex.get(nodeType) ?? [];
  }

  get(name: string): InksetPlugin | undefined {
    return this.plugins.get(name);
  }

  all(): readonly InksetPlugin[] {
    return Array.from(this.plugins.values());
  }

  widthSensitive(): readonly InksetPlugin[] {
    return this.all().filter((p) => p.widthSensitive);
  }

  transform(node: Readonly<ASTNode>, ctx: Readonly<PluginContext>): EnrichedNode {
    const handlers = this.getHandlers(node.blockType);
    if (handlers.length === 0) {
      return node as EnrichedNode;
    }

    // Exclusive dispatch: if any canHandle-enabled plugin claims this node
    // (e.g. a diagram plugin matching `lang === "mermaid"`), it runs alone.
    // Prevents the diagram output from being stomped by an unguarded code
    // plugin that would otherwise also transform the same block type.
    const specific = handlers.find((p) => p.canHandle && p.canHandle(node));
    if (specific) {
      try {
        const enriched = specific.transform(node as EnrichedNode, ctx);
        enriched.transformedBy = specific.name;
        return enriched;
      } catch (err) {
        console.warn(
          `[inkset] Plugin "${specific.name}" threw during transform for block ${node.blockId}:`,
          err,
        );
        return node as EnrichedNode;
      }
    }

    // No lang-scoped claim → chain unguarded plugins in registration order.
    // Preserves the pre-canHandle chaining behavior for back-compat with
    // collaborative plugins (e.g. linkify + highlight on the same block).
    let enriched: EnrichedNode = node as EnrichedNode;
    for (const plugin of handlers) {
      if (plugin.canHandle) continue;
      try {
        enriched = plugin.transform(enriched, ctx);
        enriched.transformedBy = plugin.name;
      } catch (err) {
        console.warn(
          `[inkset] Plugin "${plugin.name}" threw during transform for block ${node.blockId}:`,
          err,
        );
      }
    }
    return enriched;
  }

  clear(): void {
    this.plugins.clear();
    this.handlerIndex.clear();
  }
}
