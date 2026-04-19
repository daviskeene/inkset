import type { MetadataRoute } from "next";
import { DOCS_FLAT } from "../lib/docs-nav";

const SITE_URL = "https://inkset.dev";

const sitemap = (): MetadataRoute.Sitemap => {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE_URL}/docs`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/compare`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
  ];

  const docsRoutes: MetadataRoute.Sitemap = DOCS_FLAT.map((entry) => ({
    url: `${SITE_URL}/docs/${entry.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...docsRoutes];
};

export default sitemap;
