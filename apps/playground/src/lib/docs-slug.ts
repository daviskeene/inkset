// Heading-text → URL-fragment slug, shared by the server-side outline
// extractor (docs-content.ts) and the client-side heading-id stamper
// (docs-article.tsx). Keeping it isomorphic avoids pulling node:fs into
// client bundles.
export const slugifyHeading = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
