// Last-modified dates for the sitemap and structured data, read from git at
// build time. Paths are relative to the playground app. A missing date is
// better than a made-up one, so any failure (no git, a file with no history)
// returns undefined. In a shallow clone, files older than the clone depth get
// the date of the oldest commit in it, which is later than their real date.

import { execFileSync } from "node:child_process";

export const lastModified = (paths: string[]): Date | undefined => {
  try {
    const iso = execFileSync("git", ["log", "-1", "--format=%cI", "--", ...paths], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return iso ? new Date(iso) : undefined;
  } catch {
    return undefined;
  }
};

export const docsPageModified = (slug: string): Date | undefined =>
  lastModified([`src/content/docs/${slug}.md`]);
