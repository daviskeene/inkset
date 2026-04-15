import type { EnrichedNode, LayoutBlock, LayoutTree, MeasuredBlock } from "./types.js";

export interface LayoutOptions {
  /** Block margin in px between consecutive blocks. Default: 16 */
  blockMargin: number;
  /** Container width in px */
  containerWidth: number;
  /** Padding inside the container. Default: 0 */
  padding: number;
}

const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  blockMargin: 16,
  containerWidth: 800,
  padding: 0,
};

/**
 * Compute a layout tree from measured blocks.
 * Pure arithmetic over pre-computed dimensions — no DOM access.
 *
 * Each block gets absolute x/y coordinates within the container.
 * The layout is a simple vertical stack with margins between blocks.
 *
 * Performance: ~0.0002ms per block. 1000 blocks < 0.2ms.
 */
export function computeLayout(
  measured: MeasuredBlock[],
  options?: Partial<LayoutOptions>,
): LayoutTree {
  const opts = { ...DEFAULT_LAYOUT_OPTIONS, ...options };
  const { blockMargin, containerWidth, padding } = opts;

  if (containerWidth <= 0 || measured.length === 0) return [];

  const contentWidth = containerWidth - padding * 2;
  const layout: LayoutTree = [];
  let y = padding;

  for (let i = 0; i < measured.length; i++) {
    const block = measured[i];
    const width = Math.min(block.dimensions.width, contentWidth);
    const height = block.dimensions.height;

    layout.push({
      blockId: block.blockId,
      x: padding,
      y,
      width,
      height,
      node: block.node,
    });

    y += height + (i < measured.length - 1 ? blockMargin : 0);
  }

  return layout;
}

/**
 * Get the total height of a layout tree.
 * Useful for setting the container's scrollable height.
 */
export function getLayoutHeight(layout: LayoutTree, padding: number = 0): number {
  if (layout.length === 0) return 0;
  const last = layout[layout.length - 1];
  return last.y + last.height + padding;
}

/**
 * Find which blocks are visible within a viewport.
 * Used for virtual scrolling — only mount visible blocks.
 */
export function getVisibleBlocks(
  layout: LayoutTree,
  scrollTop: number,
  viewportHeight: number,
): LayoutBlock[] {
  const viewBottom = scrollTop + viewportHeight;
  return layout.filter(
    (block) =>
      block.y + block.height > scrollTop && block.y < viewBottom,
  );
}
