import { SITE_URL } from "../../lib/docs-markdown";

export const dynamic = "force-static";

// A route handler instead of robots.ts, because robots.ts cannot emit the
// comment lines that point language models to llms.txt.
export const GET = (): Response =>
  new Response(
    [
      "User-agent: *",
      "Allow: /",
      "",
      `# Documentation for language models: ${SITE_URL}/llms.txt`,
      `# All documentation in one file: ${SITE_URL}/llms-full.txt`,
      "",
      `Host: ${SITE_URL}`,
      `Sitemap: ${SITE_URL}/sitemap.xml`,
      "",
    ].join("\n"),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
