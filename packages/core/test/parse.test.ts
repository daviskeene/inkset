import { describe, expect, it } from "vitest";
import { createBlocks, parseBlock, parseBlocks, extractText } from "../src/parse.js";
import type { ParseCacheEntry } from "../src/parse.js";
import type { ASTNode, Block } from "../src/types.js";

const makeBlock = (raw: string): Block => ({
  id: 0,
  raw,
  type: "paragraph",
  hot: false,
});

const collectNodes = (node: ASTNode, type: string, out: ASTNode[] = []): ASTNode[] => {
  if (node.type === type) out.push(node);
  for (const child of node.children ?? []) {
    collectNodes(child, type, out);
  }
  return out;
};

describe("parseBlock", () => {
  it("protects inline math before markdown emphasis parsing", () => {
    const node = parseBlock(
      makeBlock("Given $a\\in\\mathcal{C}$, moments $(\\varphi(a^{k}))_{k\\geq 1}$ determine it."),
    );

    const inlineMath = collectNodes(node, "inlineMath");
    expect(inlineMath.map((math) => math.value)).toEqual([
      "a\\in\\mathcal{C}",
      "(\\varphi(a^{k}))_{k\\geq 1}",
    ]);
    expect(collectNodes(node, "emphasis")).toHaveLength(0);
  });

  it("does not treat ordinary currency as inline math", () => {
    const node = parseBlock(makeBlock("The price is $60 and the deposit is $5."));

    expect(collectNodes(node, "inlineMath")).toHaveLength(0);
  });

  it("allows inline math to start with a digit", () => {
    const node = parseBlock(makeBlock("Both factors divide $2^{r}+1$ and $2^{r}-1$ respectively."));

    expect(collectNodes(node, "inlineMath").map((math) => math.value)).toEqual([
      "2^{r}+1",
      "2^{r}-1",
    ]);
  });

  it("trims whitespace inside inline math delimiters", () => {
    const node = parseBlock(makeBlock("This is a $ latex $ expression."));

    expect(collectNodes(node, "inlineMath").map((math) => math.value)).toEqual(["latex"]);
  });

  it("does not protect math-like text inside inline code", () => {
    const node = parseBlock(makeBlock("Use `$a_b$` literally, then render $x_y$."));
    const code = collectNodes(node, "element").find((child) => child.tagName === "code");

    expect(code ? extractText(code) : "").toBe("$a_b$");
    expect(collectNodes(code as ASTNode, "inlineMath")).toHaveLength(0);
    expect(collectNodes(node, "inlineMath").map((math) => math.value)).toEqual(["x_y"]);
  });

  it("does not protect math-like text inside link destinations", () => {
    const node = parseBlock(makeBlock("[docs](/docs/$id$/view) and $x_y$"));
    const link = collectNodes(node, "element").find((child) => child.tagName === "a");

    expect(link?.properties?.href).toBe("/docs/$id$/view");
    expect(collectNodes(node, "inlineMath").map((math) => math.value)).toEqual(["x_y"]);
  });

  it("does not collide with literal placeholder-like text", () => {
    const node = parseBlock(makeBlock("Literal INKSETINLINEMATH0X and math $x_y$."));

    expect(extractText(node)).toContain("INKSETINLINEMATH0X");
    expect(collectNodes(node, "inlineMath").map((math) => math.value)).toEqual(["x_y"]);
  });
});

describe("createBlocks type detection", () => {
  it("treats tag-shaped starts as html", () => {
    expect(createBlocks(["<div>hi</div>"])[0].type).toBe("html");
    expect(createBlocks(["</p>"])[0].type).toBe("html");
    expect(createBlocks(["<br/>"])[0].type).toBe("html");
    expect(createBlocks(["<!-- note -->"])[0].type).toBe("html");
  });

  it("keeps non-tag text starting with < as a paragraph", () => {
    expect(createBlocks(["<3 this idea"])[0].type).toBe("paragraph");
    expect(createBlocks(["< 5 items remain"])[0].type).toBe("paragraph");
  });
});

describe("parseBlocks cache", () => {
  it("re-parses a frozen block when its raw text changes", () => {
    const cache = new Map<number, ParseCacheEntry>();
    const [original] = createBlocks(["See \\eqref{decay} for details."]);
    original.hot = false;
    parseBlocks([original], cache);

    // repair() can rewrite frozen blocks (e.g. \eqref resolving once a later
    // \label arrives); the cache must notice the raw change and re-parse.
    const rewritten: Block = { ...original, raw: "See $(1)$ for details." };
    const { nodes, parsedBlockIds } = parseBlocks([rewritten], cache);

    expect(parsedBlockIds.has(original.id)).toBe(true);
    expect(extractText(nodes[0])).not.toContain("\\eqref");
  });

  it("reuses the cached AST for frozen blocks with unchanged raw text", () => {
    const cache = new Map<number, ParseCacheEntry>();
    const [block] = createBlocks(["Stable paragraph."]);
    block.hot = false;
    const first = parseBlocks([block], cache);
    const second = parseBlocks([block], cache);

    expect(second.parsedBlockIds.size).toBe(0);
    expect(second.nodes[0]).toBe(first.nodes[0]);
  });
});
