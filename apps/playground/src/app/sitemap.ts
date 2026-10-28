import type { MetadataRoute } from "next";
import { DOCS_FLAT } from "../lib/docs-nav";
import { SITE_URL } from "../lib/docs-markdown";
import { docsPageModified, lastModified } from "../lib/content-dates";

const sitemap = (): MetadataRoute.Sitemap => {
  // /docs is left out because it only redirects to the first docs page.
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: lastModified([
        "src/app/page.tsx",
        "src/app/playground-client.tsx",
        "src/content/demos",
      ]),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/generative-ui`,
      lastModified: lastModified(["src/app/generative-ui"]),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/compare`,
      lastModified: lastModified(["src/app/compare"]),
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  const docsRoutes: MetadataRoute.Sitemap = DOCS_FLAT.map((entry) => ({
    url: `${SITE_URL}/docs/${entry.slug}`,
    lastModified: docsPageModified(entry.slug),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...docsRoutes];
};

export default sitemap;
