import type { ASTNode, EnrichedNode, PluginContext } from "./types";
import type { PluginRegistry } from "./plugin";

/**
 * Transform AST nodes through registered plugins.
 * Each plugin that handles the block's type gets a chance to enrich it.
 *
 * Width-sensitive plugins are tracked so the layout layer can
 * selectively re-transform on resize.
 */
export function transformBlocks(
  nodes: ASTNode[],
  registry: PluginRegistry,
  ctx: PluginContext,
  cache: Map<number, EnrichedNode>,
): EnrichedNode[] {
  const result: EnrichedNode[] = [];

  for (const node of nodes) {
    // Use cached transform for frozen blocks (unless width changed and plugin is width-sensitive)
    const cached = cache.get(node.blockId);
    if (cached && !isHotBlock(node)) {
      result.push(cached);
      continue;
    }

    const enriched = registry.transform(node, ctx);
    cache.set(node.blockId, enriched);
    result.push(enriched);
  }

  return result;
}

/**
 * Re-transform only width-sensitive blocks after a container resize.
 * Returns true if any blocks were re-transformed (meaning re-measure is needed).
 */
export function retransformWidthSensitive(
  nodes: EnrichedNode[],
  registry: PluginRegistry,
  ctx: PluginContext,
  cache: Map<number, EnrichedNode>,
): { nodes: EnrichedNode[]; changed: boolean } {
  const widthSensitivePlugins = registry.widthSensitive();
  if (widthSensitivePlugins.length === 0) {
    return { nodes, changed: false };
  }

  let changed = false;
  const result: EnrichedNode[] = [];

  for (const node of nodes) {
    // Check if this node was transformed by a width-sensitive plugin
    if (
      node.transformedBy &&
      widthSensitivePlugins.some((p) => p.name === node.transformedBy)
    ) {
      // Re-transform through the width-sensitive plugin
      const reTransformed = registry.transform(node, ctx);
      cache.set(node.blockId, reTransformed);
      result.push(reTransformed);
      changed = true;
    } else {
      result.push(node);
    }
  }

  return { nodes: result, changed };
}

function isHotBlock(node: ASTNode): boolean {
  // The last block in a streaming response is always hot
  // This is determined by the block's hot flag set during parsing
  return false; // Will be determined by the streaming orchestrator
}
