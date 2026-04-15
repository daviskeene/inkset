import type { PreframePlugin, ASTNode, EnrichedNode, PluginContext } from "./types.js";

/**
 * Registry for preframe plugins. Plugins register by node type
 * and are looked up during the transform phase.
 */
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
      // Remove any previous version of this plugin
      const filtered = handlers.filter((p) => p.name !== plugin.name);
      filtered.push(plugin);
      this.handlerIndex.set(nodeType, filtered);
    }
  }

  /** Get all plugins that handle a given node type, in registration order */
  getHandlers(nodeType: string): PreframePlugin[] {
    return this.handlerIndex.get(nodeType) ?? [];
  }

  /** Get a plugin by name */
  get(name: string): PreframePlugin | undefined {
    return this.plugins.get(name);
  }

  /** Get all registered plugins */
  all(): PreframePlugin[] {
    return Array.from(this.plugins.values());
  }

  /** Get all width-sensitive plugins */
  widthSensitive(): PreframePlugin[] {
    return this.all().filter((p) => p.widthSensitive);
  }

  /** Transform a node through matching plugins */
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
        // Degrade gracefully: return untransformed node
      }
    }
    return enriched;
  }

  clear(): void {
    this.plugins.clear();
    this.handlerIndex.clear();
  }
}
