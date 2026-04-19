// Delta-aware text wrapping for reveal animations.
//
// Two-pass model:
//
//   1. Walk the AST in DFS text order, advancing a running char offset. Text
//      past the caller's `revealedOffset` is split into tokens; each token
//      becomes a `<span data-inkset-reveal-token>` wrapper. We also collect
//      metadata (span ref, offsetStart, offsetEnd, arrivalIndex) per token
//      so the second pass can reassign delays without re-walking the tree.
//
//   2. If a `glyphLookup` was provided AND `staggerOrder` is "layout", sort
//      the collected tokens by pretext (y, x) and assign delays in that
//      order, with an optional `maxStaggerSpanMs` clamp so a 40-token burst
//      doesn't take 1.2s to reveal. Otherwise, delays follow arrival order
//      (pre-Phase-3 behaviour, also the SSR / no-Canvas fallback).
//
// The wrapped span carries `data-inkset-reveal-x/-y/-w/-h` attributes when
// coords are known — the React renderer reads these to synthesize the
// `RevealComponentProps` passed to a consumer's custom `RevealComponent`.
//
// Two classes of subtrees are treated as atomic:
//   - Skip tags (code, pre, svg, math, annotation): their text participates in
//     the running offset but their content is never split. Matches streamdown.
//   - Plugin-transformed nodes (transformedBy !== undefined): plugins own
//     their own DOM, so we pass the subtree through unchanged and let the
//     caller apply block-level entrance animation separately.

import { extractText } from "@inkset/core";
import type { ASTNode, EnrichedNode, GlyphPositionLookup, TokenCoord } from "@inkset/core";
import type { ChunkingMode, StaggerOrder } from "./types";

const SKIP_TAGS: ReadonlySet<string> = new Set(["code", "pre", "svg", "math", "annotation"]);

const DEFAULT_MAX_STAGGER_SPAN_MS = 400;

export interface WrapOptions {
  /** Character offset in DFS text order below which content is already revealed. */
  revealedOffset: number;
  /** Monotonic tick identifier. Threaded onto each produced span for debugging/keys. */
  tickId: number;
  /** Per-token stagger step in ms. */
  staggerMs: number;
  /** Split unit for the fresh portion. */
  sep: ChunkingMode;
  /**
   * Optional coord lookup — Phase 3's layout-order stagger. When absent (SSR,
   * pretext not loaded), we fall back to arrival-order delays regardless of
   * `staggerOrder`.
   */
  glyphLookup?: GlyphPositionLookup | null;
  /** Default: "layout". See {@link StaggerOrder} for semantics. */
  staggerOrder?: StaggerOrder;
  /** Clamp on total stagger span in ms. Default 400. Pass 0 to disable. */
  maxStaggerSpanMs?: number;
}

export interface WrapResult {
  /** Tree with fresh text nodes rewritten into a mix of plain text + reveal spans. */
  node: EnrichedNode;
  /** New running offset after walking — feed back as next tick's revealedOffset. */
  newOffset: number;
  /** Number of reveal spans produced. Zero means nothing changed visually. */
  tokenCount: number;
}

type WordSegment = {
  text: string;
  animate: boolean;
};

// A single reveal-span plus the metadata needed to assign its final delay in
// the second pass. Held only transiently — consumers see span properties via
// the AST, never this record.
type RevealTokenMeta = {
  span: EnrichedNode;
  offsetStart: number;
  offsetEnd: number;
  arrivalIndex: number;
};

type WalkState = {
  offset: number;
  revealedOffset: number;
  tickId: number;
  staggerMs: number;
  sep: ChunkingMode;
  tokens: RevealTokenMeta[];
};

export const wrapBlockDelta = (node: EnrichedNode, options: WrapOptions): WrapResult => {
  const state: WalkState = {
    offset: 0,
    revealedOffset: options.revealedOffset,
    tickId: options.tickId,
    staggerMs: options.staggerMs,
    sep: options.sep,
    tokens: [],
  };

  const walked = walkNode(node, state);
  // walkNode returns EnrichedNode[]; at the root we always get one node back
  // because the root is never a bare text node (it's the block's root element).
  const rootNode = (walked[0] ?? node) as EnrichedNode;

  assignDelaysAndCoords(state.tokens, options);

  return {
    node: rootNode,
    newOffset: state.offset,
    tokenCount: state.tokens.length,
  };
};

// ── Pass 1: walk + split ───────────────────────────────────────────

const walkNode = (node: EnrichedNode, state: WalkState): EnrichedNode[] => {
  if (node.type === "text") {
    return splitTextNode(node, state);
  }

  // Plugin-rendered subtrees are opaque — advance offset past their text
  // without descending.
  if (node.transformedBy !== undefined) {
    state.offset += extractText(node).length;
    return [node];
  }

  // Code/math/svg/annotation tags: advance offset, skip descent. These tags
  // may appear inside paragraphs (inline code especially). Streamdown skips
  // them; we match.
  if (node.tagName && SKIP_TAGS.has(node.tagName)) {
    state.offset += extractText(node).length;
    return [node];
  }

  if (!node.children || node.children.length === 0) {
    return [node];
  }

  const nextChildren: EnrichedNode[] = [];
  let changed = false;
  for (const child of node.children) {
    const replacements = walkNode(child as EnrichedNode, state);
    if (replacements.length !== 1 || replacements[0] !== (child as EnrichedNode)) {
      changed = true;
    }
    for (const replacement of replacements) {
      nextChildren.push(replacement);
    }
  }

  if (!changed) {
    return [node];
  }

  return [{ ...node, children: nextChildren }];
};

const splitTextNode = (node: EnrichedNode, state: WalkState): EnrichedNode[] => {
  const text = node.value ?? "";
  const start = state.offset;
  const end = start + text.length;
  state.offset = end;

  // Entirely revealed already — pass through unchanged.
  if (end <= state.revealedOffset) {
    return [node];
  }

  const revealedLocal = Math.max(0, state.revealedOffset - start);
  const revealedPart = text.slice(0, revealedLocal);
  const freshPart = text.slice(revealedLocal);
  if (freshPart.length === 0) return [node];

  const freshStartAbs = start + revealedLocal;

  const out: EnrichedNode[] = [];
  if (revealedPart.length > 0) {
    out.push({ ...node, value: revealedPart });
  }

  if (state.sep === "word") {
    let cursor = 0;
    for (const segment of splitByWord(freshPart)) {
      if (!segment.animate) {
        // Whitespace stays as plain text — no animation on gaps.
        out.push({ ...node, value: segment.text });
      } else {
        const offsetStart = freshStartAbs + cursor;
        const offsetEnd = offsetStart + segment.text.length;
        const span = makeRevealSpan(segment.text, state.tickId, state.tokens.length, node);
        state.tokens.push({
          span,
          offsetStart,
          offsetEnd,
          arrivalIndex: state.tokens.length,
        });
        out.push(span);
      }
      cursor += segment.text.length;
    }
    return out;
  }

  // char mode
  let cursor = 0;
  for (const chunk of splitByChar(freshPart)) {
    const offsetStart = freshStartAbs + cursor;
    const offsetEnd = offsetStart + chunk.length;
    const span = makeRevealSpan(chunk, state.tickId, state.tokens.length, node);
    state.tokens.push({
      span,
      offsetStart,
      offsetEnd,
      arrivalIndex: state.tokens.length,
    });
    out.push(span);
    cursor += chunk.length;
  }

  return out;
};

// ── Pass 2: delay + coord assignment ────────────────────────────────

const assignDelaysAndCoords = (tokens: readonly RevealTokenMeta[], options: WrapOptions): void => {
  if (tokens.length === 0) return;

  const order = options.staggerOrder ?? "layout";
  const lookup = options.glyphLookup;
  const useLayoutOrder = order === "layout" && lookup != null && tokens.length > 1;

  // Resolve coords up front — we do this even in arrival-order mode so the
  // spans carry data-inkset-reveal-x/y/w/h for custom RevealComponents.
  const coords: (TokenCoord | null)[] = lookup
    ? tokens.map((t) => lookup.locate(t.offsetStart, t.offsetEnd))
    : tokens.map(() => null);

  // Determine render order.
  let orderedIndices: number[];
  if (useLayoutOrder) {
    orderedIndices = tokens
      .map((_, i) => i)
      .sort((a, b) => {
        const ca = coords[a];
        const cb = coords[b];
        if (!ca && !cb) return tokens[a].arrivalIndex - tokens[b].arrivalIndex;
        // Coord-less tokens sort to the end so the located body reveals first.
        if (!ca) return 1;
        if (!cb) return -1;
        if (ca.y !== cb.y) return ca.y - cb.y;
        if (ca.x !== cb.x) return ca.x - cb.x;
        return tokens[a].arrivalIndex - tokens[b].arrivalIndex;
      });
  } else {
    orderedIndices = tokens.map((_, i) => i);
  }

  const maxSpan = options.maxStaggerSpanMs ?? DEFAULT_MAX_STAGGER_SPAN_MS;
  const rawSpan = (tokens.length - 1) * options.staggerMs;
  const effectiveStep =
    maxSpan > 0 && rawSpan > maxSpan && tokens.length > 1
      ? maxSpan / (tokens.length - 1)
      : options.staggerMs;

  orderedIndices.forEach((originalIdx, layoutPos) => {
    const token = tokens[originalIdx];
    const coord = coords[originalIdx];
    const delayMs = Math.round(layoutPos * effectiveStep);
    applyDelay(token.span, delayMs);
    updateSpanIndex(token.span, layoutPos);
    if (coord) applyCoord(token.span, coord);
  });
};

const applyDelay = (span: EnrichedNode, delayMs: number): void => {
  const style = span.properties?.style as Record<string, string | number> | undefined;
  if (style) {
    style["--inkset-reveal-delay"] = `${delayMs}ms`;
  }
};

// Rewrite the index attr to reflect the layout-order position. This is what
// data-inkset-reveal-index surfaces to CSS selectors and to the React layer's
// renderAstNode interception (which feeds tokenIndex to RevealComponentProps).
const updateSpanIndex = (span: EnrichedNode, layoutIndex: number): void => {
  if (span.properties) {
    span.properties["data-inkset-reveal-index"] = String(layoutIndex);
  }
};

const applyCoord = (span: EnrichedNode, coord: TokenCoord): void => {
  if (!span.properties) return;
  span.properties["data-inkset-reveal-x"] = coord.x.toFixed(2);
  span.properties["data-inkset-reveal-y"] = coord.y.toFixed(2);
  span.properties["data-inkset-reveal-w"] = coord.width.toFixed(2);
  span.properties["data-inkset-reveal-h"] = coord.height.toFixed(2);
};

// ── Splitters ───────────────────────────────────────────────────────

// Split a string into alternating word and whitespace runs. Word runs are the
// only ones wrapped in reveal spans; whitespace stays as plain text so normal
// spacing and line-breaking survive the animation layer.
export const splitByWord = (text: string): WordSegment[] => {
  if (text.length === 0) return [];
  const segments: WordSegment[] = [];
  let i = 0;
  while (i < text.length) {
    if (isWhitespaceChar(text.charCodeAt(i))) {
      const start = i;
      while (i < text.length && isWhitespaceChar(text.charCodeAt(i))) i += 1;
      segments.push({ text: text.slice(start, i), animate: false });
      continue;
    }
    const start = i;
    while (i < text.length && !isWhitespaceChar(text.charCodeAt(i))) i += 1;
    segments.push({ text: text.slice(start, i), animate: true });
  }
  return segments;
};

export const splitByChar = (text: string): string[] => {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const codePoint = text.codePointAt(i) ?? 0;
    const width = codePoint > 0xffff ? 2 : 1;
    chunks.push(text.slice(i, i + width));
    i += width;
  }
  return chunks;
};

const isWhitespaceChar = (code: number): boolean =>
  code === 32 || code === 9 || code === 10 || code === 13;

const makeRevealSpan = (
  chunk: string,
  tickId: number,
  initialIndex: number,
  parent: EnrichedNode,
): EnrichedNode => {
  const inner: ASTNode = {
    type: "text",
    value: chunk,
    blockId: parent.blockId,
    blockType: parent.blockType,
  };
  return {
    type: "element",
    tagName: "span",
    properties: {
      "data-inkset-reveal-token": "",
      "data-inkset-reveal-tick": String(tickId),
      // Placeholder — rewritten in assignDelaysAndCoords to the layout-order index.
      "data-inkset-reveal-index": String(initialIndex),
      // Object form because React's default renderer passes properties.style
      // straight to JSX, which expects an object (not a CSS string). Delay is
      // placeholder (0ms); assignDelaysAndCoords overwrites it.
      style: { "--inkset-reveal-delay": "0ms" },
    },
    children: [inner],
    blockId: parent.blockId,
    blockType: parent.blockType,
  };
};
