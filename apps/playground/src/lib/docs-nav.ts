// Shared table-of-contents tree for the /docs section.
//
// Every page has a flat slug (e.g. "quick-start") that maps 1:1 to a markdown
// file under src/content/docs/<slug>.md. Grouping is declarative here — the
// filesystem is flat so [...slug] routing is boring.

export type DocsEntry = {
  slug: string;
  title: string;
};

export type DocsGroup = {
  label: string;
  entries: DocsEntry[];
};

export const DOCS_NAV: DocsGroup[] = [
  {
    label: "Getting started",
    entries: [
      { slug: "introduction", title: "Introduction" },
      { slug: "install", title: "Install" },
      { slug: "quick-start", title: "Quick start" },
      { slug: "how-it-works", title: "How it works" },
    ],
  },
  {
    label: "Core",
    entries: [
      { slug: "ingest", title: "Ingest & repair" },
      { slug: "parse", title: "Parse" },
      { slug: "transform", title: "Transform" },
      { slug: "measure", title: "Measure" },
      { slug: "layout", title: "Layout" },
      { slug: "render-targets", title: "Render targets" },
    ],
  },
  {
    label: "React",
    entries: [
      { slug: "component", title: "<Inkset>" },
      { slug: "use-inkset", title: "useInkset()" },
      { slug: "streaming", title: "Streaming from an LLM" },
    ],
  },
  {
    label: "Plugins",
    entries: [
      { slug: "plugin-code", title: "@inkset/code" },
      { slug: "plugin-math", title: "@inkset/math" },
      { slug: "plugin-table", title: "@inkset/table" },
      { slug: "plugin-diagram", title: "@inkset/diagram" },
      { slug: "plugin-animate", title: "@inkset/animate" },
      { slug: "writing-plugins", title: "Writing a plugin" },
    ],
  },
  {
    label: "Reference",
    entries: [
      { slug: "theming", title: "Theming" },
      { slug: "benchmarks", title: "Benchmarks" },
      { slug: "migration", title: "Migration" },
    ],
  },
];

// Flat, ordered list used for prev/next and entry lookups. The TOC groups
// are flattened in their declared order, so the reading sequence matches
// the sidebar top-to-bottom.
export const DOCS_FLAT: Array<DocsEntry & { groupLabel: string }> = DOCS_NAV.flatMap((group) =>
  group.entries.map((entry) => ({ ...entry, groupLabel: group.label })),
);

export const DOCS_DEFAULT_SLUG = "introduction";

export const findEntry = (slug: string): (DocsEntry & { groupLabel: string }) | null => {
  return DOCS_FLAT.find((entry) => entry.slug === slug) ?? null;
};

export const getNeighbors = (
  slug: string,
): {
  prev: DocsEntry | null;
  next: DocsEntry | null;
} => {
  const idx = DOCS_FLAT.findIndex((entry) => entry.slug === slug);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? DOCS_FLAT[idx - 1] : null,
    next: idx < DOCS_FLAT.length - 1 ? DOCS_FLAT[idx + 1] : null,
  };
};
