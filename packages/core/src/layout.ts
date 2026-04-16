// Layout layer: pure arithmetic to compute a vertical-stack layout from measured blocks.
import type { LayoutBlock, LayoutTree, MeasuredBlock } from "./types";

export type LayoutOptions = {
  blockMargin: number;
  containerWidth: number;
  padding: number;
};

const DEFAULT_BLOCK_MARGIN = 16;
const DEFAULT_CONTAINER_WIDTH = 800;

const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  blockMargin: DEFAULT_BLOCK_MARGIN,
  containerWidth: DEFAULT_CONTAINER_WIDTH,
  padding: 0,
};

export const computeLayout = (
  measured: readonly MeasuredBlock[],
  options?: Partial<LayoutOptions>,
): LayoutTree => {
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
      shrinkwrapWidth: block.shrinkwrapWidth,
    });

    y += height + (i < measured.length - 1 ? blockMargin : 0);
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
  return layout.filter(
    (block) =>
      block.y + block.height > scrollTop && block.y < viewBottom,
  );
};
