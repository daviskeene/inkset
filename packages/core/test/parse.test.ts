import { describe, expect, it } from "vitest";
import { parseBlock } from "../src/parse.js";
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
      makeBlock(
        "Given $a\\in\\mathcal{C}$, moments $(\\varphi(a^{k}))_{k\\geq 1}$ determine it.",
      ),
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
});
