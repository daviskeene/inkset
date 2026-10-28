import { GET as llmsTxt } from "../llms.txt/route";
import { markdownResponse } from "../../lib/docs-markdown";

export const dynamic = "force-static";

// The Markdown version of the homepage, reached through the rewrite in
// next.config.ts for `/` with `Accept: text/markdown`. llms.txt already is
// the site's summary in Markdown, so this serves the same text.
export const GET = async (): Promise<Response> => markdownResponse(await (await llmsTxt()).text());
