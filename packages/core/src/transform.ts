// Transform layer: runs AST nodes through registered plugins to produce enriched nodes.
import type { ASTNode, EnrichedNode, PluginContext } from "./types";
import type { PluginRegistry } from "./plugin";

/**
 * Width-sensitive plugins are tracked so the layout layer can
 * selectively re-transform on resize without reprocessing everything.
 */
export const transformBlocks = (
  nodes: readonly ASTNode[],
  registry: PluginRegistry,
  ctx: Readonly<PluginContext>,
  cache: Map<number, EnrichedNode>,
  parsedBlockIds?: ReadonlySet<number>,
): EnrichedNode[] => {
  const result: EnrichedNode[] = [];

  for (const node of nodes) {
    // Frozen blocks with a cached transform are reused; freshly parsed blocks get re-transformed
    const wasFreshlyParsed = parsedBlockIds?.has(node.blockId) ?? false;
    const cached = cache.get(node.blockId);
    if (cached && !wasFreshlyParsed) {
      result.push(cached);
      continue;
    }

    const enriched = registry.transform(node, ctx);
    cache.set(node.blockId, enriched);
    result.push(enriched);
  }

  return result;
};

/** Re-transforms only width-sensitive blocks after a container resize. */
export const retransformWidthSensitive = (
  nodes: EnrichedNode[],
  registry: PluginRegistry,
  ctx: Readonly<PluginContext>,
  cache: Map<number, EnrichedNode>,
): { nodes: EnrichedNode[]; changed: boolean } => {
  const widthSensitivePlugins = registry.widthSensitive();
  if (widthSensitivePlugins.length === 0) {
    return { nodes, changed: false };
  }

  let changed = false;
  const result: EnrichedNode[] = [];

  for (const node of nodes) {
    if (node.transformedBy && widthSensitivePlugins.some((p) => p.name === node.transformedBy)) {
      const reTransformed = registry.transform(node, ctx);
      cache.set(node.blockId, reTransformed);
      result.push(reTransformed);
      changed = true;
    } else {
      result.push(node);
    }
  }

  return { nodes: result, changed };
};
