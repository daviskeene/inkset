// Plain-Markdown versions of the docs for agents. The HTML pages render their
// body through Inkset, which only renders in the browser, so a client that
// doesn't run JavaScript sees a loading state. These helpers back the
// /docs/<slug>.md routes, llms.txt, and llms-full.txt.

import type { DocsPage } from "./docs-content";
import { EXAMPLE_MARKER_RE } from "./docs-body";

export const SITE_URL = "https://inkset.dev";

export const SITE_SUMMARY =
  "Inkset is an open source React library for rendering LLM output. It handles streaming Markdown, code blocks, math, tables, Mermaid diagrams, and generative UI, and it can replace react-markdown or Streamdown.";

export const SITE_DETAILS = `Inkset measures text once with Pretext and calculates the layout with arithmetic, so finished blocks stay in place while tokens stream, and a resize does not need DOM measurements. Each page below is also available as Markdown at its URL plus \`.md\`, and ${SITE_URL}/llms-full.txt contains all pages in one file.`;

export const docsMarkdownUrl = (slug: string): string => `${SITE_URL}/docs/${slug}.md`;

// Live examples are React components the HTML page swaps in for a marker
// comment; an agent reading the Markdown gets a pointer to the page instead.

// Root-relative links resolve against inkset.dev only in a browser. Docs links
// go to their Markdown version so an agent can keep following them.
const RELATIVE_LINK_RE = /\]\((\/[^)\s]*)\)/g;
const DOCS_LINK_RE = /^\/docs\/([a-z0-9-]+)(#.*)?$/;

const absolutize = (href: string): string => {
  const docs = DOCS_LINK_RE.exec(href);
  if (docs) return `${docsMarkdownUrl(docs[1])}${docs[2] ?? ""}`;
  return `${SITE_URL}${href}`;
};

export const toAgentMarkdown = (page: DocsPage): string => {
  const markdown = [`# ${page.title}`, page.lede, page.body.trim()].filter(Boolean).join("\n\n");
  return `${markdown
    .replace(
      EXAMPLE_MARKER_RE,
      `> This example is interactive. Open ${SITE_URL}/docs/${page.slug} in a browser to try it.`,
    )
    .replace(RELATIVE_LINK_RE, (_, href: string) => `](${absolutize(href)})`)}\n`;
};

export const markdownResponse = (markdown: string): Response =>
  new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
