import type { PreframePlugin, ASTNode, EnrichedNode, PluginContext } from "./types";

export class PluginRegistry {
  private plugins: Map<string, PreframePlugin> = new Map();
  private handlerIndex: Map<string, PreframePlugin[]> = new Map();

  register(plugin: PreframePlugin): void {
    if (this.plugins.has(plugin.name)) {
      console.warn(`[preframe] Plugin "${plugin.name}" already registered, replacing.`);
    }
    this.plugins.set(plugin.name, plugin);

    for (const nodeType of plugin.handles) {
      const handlers = this.handlerIndex.get(nodeType) ?? [];
      const filtered = handlers.filter((p) => p.name !== plugin.name);
      filtered.push(plugin);
      this.handlerIndex.set(nodeType, filtered);
    }
  }

  getHandlers(nodeType: string): PreframePlugin[] {
    return this.handlerIndex.get(nodeType) ?? [];
  }

  get(name: string): PreframePlugin | undefined {
    return this.plugins.get(name);
  }

  all(): PreframePlugin[] {
    return Array.from(this.plugins.values());
  }

  widthSensitive(): PreframePlugin[] {
    return this.all().filter((p) => p.widthSensitive);
  }

  transform(node: ASTNode, ctx: PluginContext): EnrichedNode {
    const handlers = this.getHandlers(node.blockType);
    if (handlers.length === 0) {
      return node as EnrichedNode;
    }

    let enriched: EnrichedNode = node as EnrichedNode;
    for (const plugin of handlers) {
      try {
        enriched = plugin.transform(enriched, ctx);
        enriched.transformedBy = plugin.name;
      } catch (err) {
        console.warn(
          `[preframe] Plugin "${plugin.name}" threw during transform for block ${node.blockId}:`,
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
