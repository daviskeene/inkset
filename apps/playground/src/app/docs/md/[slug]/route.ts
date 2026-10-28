import { loadDocsPage } from "../../../../lib/docs-content";
import { DOCS_FLAT } from "../../../../lib/docs-nav";
import { markdownResponse, toAgentMarkdown } from "../../../../lib/docs-markdown";

// Reached through the rewrites in next.config.ts: /docs/<slug>.md, or
// /docs/<slug> with `Accept: text/markdown`.
export const dynamicParams = false;

export const generateStaticParams = async (): Promise<Array<{ slug: string }>> => {
  return DOCS_FLAT.map((entry) => ({ slug: entry.slug }));
};

export const GET = async (
  _request: Request,
  props: { params: Promise<{ slug: string }> },
): Promise<Response> => {
  const { slug } = await props.params;
  const page = await loadDocsPage(slug);
  if (!page) return new Response("Not found", { status: 404 });
  return markdownResponse(toAgentMarkdown(page));
};
