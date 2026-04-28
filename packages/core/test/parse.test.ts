import { describe, expect, it } from "vitest";
import { parseBlock, extractText } from "../src/parse.js";
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
