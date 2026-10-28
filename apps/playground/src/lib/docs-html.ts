// Server-rendered HTML for a docs page's Markdown. Inkset measures text with
// Canvas, so during SSR it renders only its loading fallback. The docs pass
// this HTML as that fallback: crawlers and readers get real headings, prose,
// code, and tables in the first response, and Inkset swaps in its measured
// layout once it mounts.
//
// The output reuses Inkset's class names for code and table blocks and sets
// the same gaps between blocks as the measured layout, so the handover barely
// moves anything.

import { resolveBlockGap, type BlockSpacing, type BuiltinBlockKind } from "@inkset/core";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { slugifyHeading } from "./docs-slug";

type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: string;
};

const element = (
  tagName: string,
  properties: Record<string, unknown>,
  children: HastNode[],
): HastNode => ({ type: "element", tagName, properties, children });

const text = (value: string): HastNode => ({ type: "text", value });

const textContent = (node: HastNode): string =>
  node.type === "text" ? (node.value ?? "") : (node.children ?? []).map(textContent).join("");

const HEADING_KINDS: Record<string, BuiltinBlockKind> = {
  h1: "heading1",
  h2: "heading2",
  h3: "heading3",
  h4: "heading4",
  h5: "heading5",
  h6: "heading6",
};

const blockKind = (node: HastNode): BuiltinBlockKind => {
  const tag = node.tagName ?? "";
  if (HEADING_KINDS[tag]) return HEADING_KINDS[tag];
  if (tag === "p") return textContent(node).trimStart().startsWith("$$") ? "math" : "paragraph";
  if (tag === "ul") return "unordered-list";
  if (tag === "ol") return "ordered-list";
  if (tag === "pre") return "code";
  if (tag === "table") return "table";
  if (tag === "blockquote") return "blockquote";
  if (tag === "hr") return "hr";
  if (tag === "section") return "footnotes";
  return "unknown";
};

// The same chrome @inkset/code renders around a block before Shiki loads.
const wrapCode = (pre: HastNode): HastNode => {
  const code = pre.children?.find((child) => child.tagName === "code");
  const classNames = (code?.properties?.className as string[] | undefined) ?? [];
  const lang = classNames.find((name) => name.startsWith("language-"))?.slice(9) ?? "text";
  return element("div", { className: ["inkset-code-block"] }, [
    element("div", { className: ["inkset-code-header"] }, [
      element("span", { className: ["inkset-code-lang"] }, [text(lang)]),
      element("span", { className: ["inkset-code-copy"], ariaHidden: "true" }, [text("Copy")]),
    ]),
    element("pre", { className: ["inkset-code-content"] }, [
      element("code", {}, [text(code ? textContent(code) : textContent(pre))]),
    ]),
  ]);
};

// The same chrome @inkset/table renders with its default options.
const wrapTable = (table: HastNode): HastNode =>
  element("div", { className: ["inkset-table-block"], dataBorderStyle: "horizontal" }, [
    element("div", { className: ["inkset-table-header"] }, [
      element("span", { className: ["inkset-table-copy"], ariaHidden: "true" }, [text("Copy CSV")]),
    ]),
    element("div", { className: ["inkset-table-scroll"] }, [element("div", {}, [table])]),
  ]);

const rehypeInksetBlocks = (spacing: BlockSpacing) => () => (tree: HastNode) => {
  const blocks: HastNode[] = [];
  let previousKind: BuiltinBlockKind | null = null;

  for (const node of tree.children ?? []) {
    if (node.type !== "element") continue;
    const kind = blockKind(node);
    let block = node;

    if (kind.startsWith("heading")) {
      const id = slugifyHeading(textContent(node));
      if (id) node.properties = { ...node.properties, id };
    } else if (kind === "code") {
      block = wrapCode(node);
    } else if (kind === "table") {
      block = wrapTable(node);
    }

    if (previousKind) {
      const gap = resolveBlockGap(previousKind, kind, spacing);
      block.properties = { ...block.properties, style: `margin-top:${gap}px` };
    }
    blocks.push(block);
    previousKind = kind;
  }

  tree.children = blocks;
};

export const renderDocsHtml = async (markdown: string, spacing: BlockSpacing): Promise<string> => {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeInksetBlocks(spacing))
    .use(rehypeStringify)
    .process(markdown);
  return String(file);
};
