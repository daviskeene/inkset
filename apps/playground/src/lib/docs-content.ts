import { promises as fs } from "node:fs";
import path from "node:path";
import { slugifyHeading } from "./docs-slug";

export type OutlineItem = {
  id: string;
  text: string;
  level: 2 | 3;
};

export type DocsPage = {
  slug: string;
  title: string;
  lede: string | null;
  body: string; // markdown starting from the first non-title block
  outline: OutlineItem[];
};

const DOCS_DIR = path.join(process.cwd(), "src", "content", "docs");

export const loadDocsPage = async (slug: string): Promise<DocsPage | null> => {
  const safe = slug.replace(/[^a-z0-9-]/gi, "");
  if (safe !== slug || !slug) return null;
  const filePath = path.join(DOCS_DIR, `${safe}.md`);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }

  const lines = raw.split(/\r?\n/);

  let title = slug;
  let lede: string | null = null;
  let bodyStart = 0;

  // First non-empty line that's a level-1 heading becomes the page title.
  // Everything between that heading and the next blank line / heading becomes
  // the lede. We strip both from `body` — the chrome renders them itself so
  // they aren't flowed through Inkset.
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i < lines.length && lines[i].startsWith("# ")) {
    title = lines[i].slice(2).trim();
    i++;
    while (i < lines.length && lines[i].trim() === "") i++;
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("#")) {
      paragraph.push(lines[i]);
      i++;
    }
    if (paragraph.length > 0) {
      lede = paragraph.join(" ").trim();
    }
    bodyStart = i;
  }

  const body = lines.slice(bodyStart).join("\n").replace(/^\s+/, "");

  // Walk the body to build the outline. Only h2 + h3 surface in "on this
  // page" — deeper levels would make the rail noisy. Skip headings inside
  // fenced code blocks.
  const outline: OutlineItem[] = [];
  let insideFence = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;
    const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const level = m[1].length as 2 | 3;
    const text = m[2].replace(/[`*_]/g, "").trim();
    if (!text) continue;
    outline.push({ id: slugifyHeading(text), text, level });
  }

  return { slug, title, lede, body, outline };
};
