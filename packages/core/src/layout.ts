// Layout layer: pure arithmetic to compute a vertical-stack layout from measured blocks.
import { DEFAULT_BLOCK_SPACING, resolveBlockGap } from "./block-spacing";
import type { BlockSpacing, LayoutBlock, LayoutTree, MeasuredBlock } from "./types";

export type LayoutOptions = {
  blockSpacing: BlockSpacing;
  containerWidth: number;
  padding: number;
};

const DEFAULT_CONTAINER_WIDTH = 800;

const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  blockSpacing: DEFAULT_BLOCK_SPACING,
  containerWidth: DEFAULT_CONTAINER_WIDTH,
  padding: 0,
};

/** Index of the first block at or after `from` that takes vertical space, or -1. */
const nextVisibleIndex = (measured: readonly MeasuredBlock[], from: number): number => {
  for (let i = from; i < measured.length; i++) {
    if (measured[i].dimensions.height > 0) return i;
  }
  return -1;
};

export const computeLayout = (
  measured: readonly MeasuredBlock[],
  options?: Partial<LayoutOptions>,
): LayoutTree => {
  const opts = { ...DEFAULT_LAYOUT_OPTIONS, ...options };
  const { blockSpacing, containerWidth, padding } = opts;

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
      kind: block.kind,
      shrinkwrapWidth: block.shrinkwrapWidth,
    });

    // A zero-height block renders nothing (an HTML comment, a scroll anchor, a
    // bare link-definition block), so it is transparent to spacing: it takes
    // no height, owes no gap, and the gap its visible predecessor adds is the
    // one the pair rules resolve for the next *visible* block.
    if (height > 0) {
      const next = nextVisibleIndex(measured, i + 1);
      const gap = next === -1 ? 0 : resolveBlockGap(block.kind, measured[next].kind, blockSpacing);
      y += height + gap;
    }
  }

  return layout;
};

export const getLayoutHeight = (layout: readonly LayoutBlock[], padding: number = 0): number => {
  if (layout.length === 0) return 0;
  const last = layout[layout.length - 1];
  return last.y + last.height + padding;
};

/** Filters to only blocks intersecting the visible viewport, for virtual scrolling. */
export const getVisibleBlocks = (
  layout: readonly LayoutBlock[],
  scrollTop: number,
  viewportHeight: number,
): LayoutBlock[] => {
  const viewBottom = scrollTop + viewportHeight;
  return layout.filter((block) => block.y + block.height > scrollTop && block.y < viewBottom);
};
