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
  if (!entry) return { title: "Docs · Inkset" };
  return {
    title: `${entry.title} · Inkset docs`,
    description: `Inkset documentation — ${entry.title}.`,
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
