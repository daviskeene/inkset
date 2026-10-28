// Layout settings and body splitting shared by the client article and the
// server-rendered fallback, so both lay out the same parts the same way.

import type { BlockSpacing } from "@inkset/core";

// A page's live example replaces its marker comment in the Markdown body.
export const EXAMPLE_MARKER_RE = /<!-- docs-example:[\w-]+ -->/g;

export const splitDocsBody = (body: string): string[] => body.split(EXAMPLE_MARKER_RE);

// HTML for the lede and each body part, rendered on the server.
export type DocsSsrHtml = { lede: string | null; body: string[] };

export const ZERO_BLOCK_SPACING: BlockSpacing = { default: 0 };

export const DOCS_BLOCK_SPACING: BlockSpacing = {
  default: 8,
  blocks: {
    heading1: { top: 4, bottom: 8 },
    heading2: { top: 18, bottom: 6 },
    heading3: { top: 14, bottom: 6 },
    paragraph: { bottom: 4 },
    "unordered-list": { top: 2, bottom: 6 },
    "ordered-list": { top: 2, bottom: 6 },
    blockquote: { top: 4, bottom: 6 },
    code: { top: 8, bottom: 8 },
    table: { top: 8, bottom: 8 },
    math: { top: 8, bottom: 8 },
    hr: { top: 12, bottom: 12 },
  },
  pairs: [
    { from: ["heading1", "heading2", "heading3"], to: "paragraph", gap: 8 },
    {
      from: ["heading1", "heading2", "heading3"],
      to: ["unordered-list", "ordered-list", "code", "table", "math", "blockquote"],
      gap: 10,
    },
    { from: "paragraph", to: "heading2", gap: 20 },
    { from: "paragraph", to: "heading3", gap: 16 },
    { from: ["unordered-list", "ordered-list"], to: "paragraph", gap: 8 },
  ],
};
