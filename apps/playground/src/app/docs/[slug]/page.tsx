import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadDocsPage } from "../../../lib/docs-content";
import { DOCS_FLAT, findEntry, getNeighbors } from "../../../lib/docs-nav";
import { DocsShell } from "../../../components/docs/docs-shell";

type Params = { slug: string };

export const generateStaticParams = async (): Promise<Array<Params>> => {
  return DOCS_FLAT.map((entry) => ({ slug: entry.slug }));
};

export const generateMetadata = async (props: { params: Promise<Params> }): Promise<Metadata> => {
  const { slug } = await props.params;
  const entry = findEntry(slug);
  if (!entry) return { title: "Docs" };

  // Prefer the page's actual lede as the meta description — it's hand-written
  // per doc and far more useful to crawlers than a templated fallback. We
  // clamp to ~200 chars so SERP snippets don't truncate mid-word.
  const page = await loadDocsPage(slug);
  const rawLede = page?.lede?.replace(/\s+/g, " ").trim() ?? "";
  const description = rawLede
    ? rawLede.length > 200
      ? `${rawLede.slice(0, 197).trimEnd()}…`
      : rawLede
    : `${entry.title} — Inkset documentation.`;

  const title = entry.title;
  const canonical = `/docs/${slug}`;

  return {
    title,
    description,
    alternates: { canonical },
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
  return <DocsShell page={page} navEntry={entry} prev={prev} next={next} />;
};

export default DocsPage;
