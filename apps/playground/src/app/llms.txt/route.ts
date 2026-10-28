import { DOCS_NAV } from "../../lib/docs-nav";
import { loadDocsPage } from "../../lib/docs-content";
import {
  SITE_DETAILS,
  SITE_SUMMARY,
  SITE_URL,
  SKILL_URL,
  docsMarkdownUrl,
} from "../../lib/docs-markdown";

export const dynamic = "force-static";

// Descriptions keep a link's text and drop its URL, so a cut never lands
// inside a link and a relative href never reaches the agent.
const truncate = (s: string, max: number): string => {
  const clean = s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
};

export const GET = async (): Promise<Response> => {
  const lines: string[] = [];

  lines.push("# Inkset");
  lines.push("");
  lines.push(`> ${SITE_SUMMARY}`);
  lines.push("");
  lines.push(SITE_DETAILS);
  lines.push("");

  for (const group of DOCS_NAV) {
    lines.push(`## ${group.label}`);
    lines.push("");
    for (const entry of group.entries) {
      const page = await loadDocsPage(entry.slug);
      const url = docsMarkdownUrl(entry.slug);
      if (page?.lede) {
        lines.push(`- [${entry.title}](${url}): ${truncate(page.lede, 200)}`);
      } else {
        lines.push(`- [${entry.title}](${url})`);
      }
    }
    lines.push("");
  }

  lines.push("## Agent setup");
  lines.push("");
  lines.push(
    `- [Inkset setup skill](${SKILL_URL}): Steps for a coding agent to add Inkset to a project, or to move a project from react-markdown or Streamdown. Install it with \`npx skills add daviskeene/inkset\`.`,
  );
  lines.push("");

  lines.push("## Optional");
  lines.push("");
  lines.push(
    `- [Playground](${SITE_URL}/): An interactive demo that streams sample responses through Inkset, with presets and themes.`,
  );
  lines.push(
    `- [Generative UI demo](${SITE_URL}/generative-ui): A replayed conversation where the answer mixes streamed Markdown with an interactive json-render component.`,
  );
  lines.push(
    `- [Compare](${SITE_URL}/compare): Streams the same response into Inkset, Streamdown, and react-markdown, and measures their render time in the browser.`,
  );
  lines.push(
    "- [GitHub](https://github.com/daviskeene/inkset): Source code, issues, and releases.",
  );
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
};
