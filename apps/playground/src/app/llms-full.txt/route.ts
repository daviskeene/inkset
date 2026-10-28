import { DOCS_FLAT } from "../../lib/docs-nav";
import { loadDocsPage } from "../../lib/docs-content";
import { SITE_DETAILS, SITE_SUMMARY, toAgentMarkdown } from "../../lib/docs-markdown";

export const dynamic = "force-static";

// Every docs page in sidebar order, so an agent can read the whole manual in
// one request.
export const GET = async (): Promise<Response> => {
  const pages: string[] = [];
  for (const entry of DOCS_FLAT) {
    const page = await loadDocsPage(entry.slug);
    if (page) pages.push(toAgentMarkdown(page));
  }

  const text = [`# Inkset\n\n> ${SITE_SUMMARY}\n\n${SITE_DETAILS}\n`, ...pages].join("\n---\n\n");

  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
};
