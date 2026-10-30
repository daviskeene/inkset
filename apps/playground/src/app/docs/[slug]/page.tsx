import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadDocsPage, type DocsPage as DocsPageContent } from "../../../lib/docs-content";
import { DOCS_FLAT, DOCS_NAV, findEntry, getNeighbors } from "../../../lib/docs-nav";
import { DOCS_BLOCK_SPACING, ZERO_BLOCK_SPACING, splitDocsBody } from "../../../lib/docs-body";
import { renderDocsHtml } from "../../../lib/docs-html";
import { SITE_URL } from "../../../lib/docs-markdown";
import { docsPageModified } from "../../../lib/content-dates";
import { DocsShell } from "../../../components/docs/docs-shell";
import { JsonLd } from "../../../components/json-ld";

type Params = { slug: string };

export const generateStaticParams = async (): Promise<Array<Params>> => {
  return DOCS_FLAT.map((entry) => ({ slug: entry.slug }));
};

// Prefer the page's actual lede as the meta description — it's hand-written
// per doc and far more useful to crawlers than a templated fallback. We
// clamp to ~200 chars so SERP snippets don't truncate mid-word.
const describe = (page: DocsPageContent | null, title: string): string => {
  // Search results show the description as plain text, so drop code ticks and
  // keep only the text of Markdown links.
  const rawLede =
    page?.lede
      ?.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/`/g, "")
      .replace(/\s+/g, " ")
      .trim() ?? "";
  if (!rawLede) return `${title} — Inkset documentation.`;
  return rawLede.length > 200 ? `${rawLede.slice(0, 197).trimEnd()}…` : rawLede;
};

export const generateMetadata = async (props: { params: Promise<Params> }): Promise<Metadata> => {
  const { slug } = await props.params;
  const entry = findEntry(slug);
  if (!entry) return { title: "Docs" };

  const page = await loadDocsPage(slug);
  const description = describe(page, entry.title);

  // The page's own heading can be more descriptive than its sidebar title.
  const title = page?.title ?? entry.title;
  const canonical = `/docs/${slug}`;

  return {
    title,
    description,
    alternates: { canonical, types: { "text/markdown": `${canonical}.md` } },
    openGraph: {
      type: "article",
      url: `https://inkset.dev${canonical}`,
      title: `${title} — Inkset`,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — Inkset`,
      description,
    },
  };
};

const DocsPage = async ({ params }: { params: Promise<Params> }) => {
  const { slug } = await params;
  const entry = findEntry(slug);
  if (!entry) {
    notFound();
  }
  const page = await loadDocsPage(slug);
  if (!page) {
    notFound();
  }
  const { prev, next } = getNeighbors(slug);

  // <Inkset> renders only a loading state on the server, so the article gets
  // this HTML as its fallback and the first response carries the full page.
  const ssrHtml = {
    lede: page.lede ? await renderDocsHtml(page.lede, ZERO_BLOCK_SPACING) : null,
    body: await Promise.all(
      splitDocsBody(page.body).map((part) => renderDocsHtml(part, DOCS_BLOCK_SPACING)),
    ),
  };

  const url = `${SITE_URL}/docs/${slug}`;
  const groupStart = DOCS_NAV.find((group) => group.label === entry.groupLabel)?.entries[0];
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: page?.title ?? entry.title,
        description: describe(page, entry.title),
        url,
        mainEntityOfPage: url,
        inLanguage: "en",
        dateModified: docsPageModified(slug)?.toISOString(),
        author: { "@type": "Person", name: "Davis Keene", url: "https://daviskeene.com" },
        isPartOf: { "@type": "WebSite", name: "Inkset", url: SITE_URL },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { name: "Docs", item: `${SITE_URL}/docs/introduction` },
          { name: entry.groupLabel, item: `${SITE_URL}/docs/${groupStart?.slug ?? slug}` },
          { name: entry.title, item: url },
        ].map((crumb, index) => ({ "@type": "ListItem", position: index + 1, ...crumb })),
      },
    ],
  };

  return (
    <>
      <JsonLd data={structuredData} />
      <DocsShell page={page} ssrHtml={ssrHtml} navEntry={entry} prev={prev} next={next} />
    </>
  );
};

export default DocsPage;
