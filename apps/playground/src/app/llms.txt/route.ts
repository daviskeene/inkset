import { DOCS_NAV } from "../../lib/docs-nav";
import { loadDocsPage } from "../../lib/docs-content";

export const dynamic = "force-static";

const SITE_URL = "https://inkset.dev";

const truncate = (s: string, max: number): string => {
  const clean = s.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
};

export const GET = async (): Promise<Response> => {
  const lines: string[] = [];

  lines.push("# Inkset");
  lines.push("");
  lines.push(
    "> A rendering library for AI chat UIs in React. Streaming-first, pretext-powered layout; plugin-driven for code, math, tables, and diagrams.",
  );
  lines.push("");
  lines.push(
    "Inkset is a React markdown renderer built for token-by-token LLM output. Each block is measured and laid out in a pretext pass, so streaming content reflows without visible shift — text reads like published prose instead of a jittering terminal.",
  );
  lines.push("");

  for (const group of DOCS_NAV) {
    lines.push(`## ${group.label}`);
    lines.push("");
    for (const entry of group.entries) {
      const page = await loadDocsPage(entry.slug);
      const url = `${SITE_URL}/docs/${entry.slug}`;
      if (page?.lede) {
        lines.push(`- [${entry.title}](${url}): ${truncate(page.lede, 200)}`);
      } else {
        lines.push(`- [${entry.title}](${url})`);
      }
    }
    lines.push("");
  }

  lines.push("## Optional");
  lines.push("");
  lines.push(
    `- [Playground](${SITE_URL}/): interactive streaming-markdown demo with scenario presets and theme switcher.`,
  );
  lines.push(
    `- [Compare](${SITE_URL}/compare): side-by-side performance comparison with Streamdown.`,
  );
  lines.push("- [GitHub](https://github.com/daviskeene/inkset): source, issues, releases.");
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
};
