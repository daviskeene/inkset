import { describe, expect, it } from "vitest";
import {
  collectDocumentReferences,
  createBlocks,
  parseBlock,
  parseBlocks,
  extractText,
} from "../src/parse.js";
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

const parseDocument = (rawBlocks: string[]) => {
  const { blocks, references } = collectDocumentReferences(rawBlocks);
  return createBlocks(blocks, references).map((block) => ({ block, node: parseBlock(block) }));
};

const findElements = (node: ASTNode, tagName: string, out: ASTNode[] = []): ASTNode[] => {
  if (node.type === "element" && node.tagName === tagName) out.push(node);
  for (const child of node.children ?? []) findElements(child, tagName, out);
  return out;
};

const frozen = (blocks: Block[]): Block[] => blocks.map((block) => ({ ...block, hot: false }));

describe("document references", () => {
  it("detects footnote definition blocks", () => {
    expect(createBlocks(["[^1]: A note."])[0].type).toBe("footnotes");
  });

  it("resolves footnotes across blocks and numbers them in document order", () => {
    const parsed = parseDocument([
      "Ref A[^b] and B[^a].",
      "Again[^a].",
      "[^a]: Def a.",
      "[^b]: Def **b**.",
    ]);
    expect(parsed.map((p) => p.block.type)).toEqual(["paragraph", "paragraph", "footnotes"]);

    const refs0 = findElements(parsed[0].node, "a");
    expect(refs0.map(extractText)).toEqual(["1", "2"]);
    expect(refs0.map((a) => a.properties?.href)).toEqual([
      "#user-content-fn-b",
      "#user-content-fn-a",
    ]);
    expect(refs0[0].properties?.["data-footnote-ref"]).toBe("");
    expect(refs0[0].properties?.["aria-describedby"]).toBe("footnote-label");
    expect(findElements(parsed[0].node, "section")).toHaveLength(0);

    expect(findElements(parsed[1].node, "a").map(extractText)).toEqual(["2"]);

    const section = findElements(parsed[2].node, "section");
    expect(section).toHaveLength(1);
    expect(section[0].properties?.["data-footnotes"]).toBe("");
    expect(findElements(section[0], "li").map((li) => li.properties?.id)).toEqual([
      "user-content-fn-b",
      "user-content-fn-a",
    ]);
    expect(findElements(section[0], "strong").map(extractText)).toEqual(["b"]);
  });

  it("keeps an indented continuation paragraph with its footnote", () => {
    const parsed = parseDocument([
      "Text[^1].",
      "[^1]: First paragraph.",
      "    Second paragraph.",
      "After.",
    ]);
    expect(parsed.map((p) => p.block.type)).toEqual(["paragraph", "paragraph", "footnotes"]);
    expect(extractText(parsed[1].node)).toContain("After.");
    expect(findElements(parsed[1].node, "pre")).toHaveLength(0);
    const paragraphs = findElements(parsed[2].node, "p").map(extractText);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toContain("First paragraph.");
    expect(paragraphs[1]).toContain("Second paragraph.");
  });

  it("renders nothing for unreferenced footnote definitions", () => {
    const parsed = parseDocument(["Plain text.", "[^x]: unused"]);
    expect(parsed[1].block.type).toBe("footnotes");
    expect(parsed[1].node.children).toEqual([]);
    expect(extractText(parsed[1].node)).toBe("");
  });

  it("ignores footnote references inside inline code", () => {
    const parsed = parseDocument(["Use `[^1]` syntax.", "[^1]: def"]);
    expect(findElements(parsed[0].node, "sup")).toHaveLength(0);
    expect(findElements(parsed[0].node, "code").map(extractText)).toEqual(["[^1]"]);
    expect(parsed[1].node.children).toEqual([]);
  });

  it("resolves link reference definitions across blocks", () => {
    const parsed = parseDocument([
      "See [the docs][d] and ![img][d].",
      '[d]: https://example.com "Title"',
    ]);
    expect(findElements(parsed[0].node, "a").map((a) => a.properties?.href)).toEqual([
      "https://example.com",
    ]);
    expect(findElements(parsed[0].node, "img")[0].properties?.src).toBe("https://example.com");
    expect(parsed[1].node.children).toEqual([]);
  });

  it("re-parses a frozen block when a late definition arrives", () => {
    const cache = new Map<number, ParseCacheEntry>();
    const first = collectDocumentReferences(["Cite[^1].", "Filler."]);
    const before = parseBlocks(frozen(createBlocks(first.blocks, first.references)), cache);
    expect(findElements(before.nodes[0], "sup")).toHaveLength(0);

    const second = collectDocumentReferences(["Cite[^1].", "Filler.", "[^1]: Late."]);
    const after = parseBlocks(frozen(createBlocks(second.blocks, second.references)), cache);
    expect(after.parsedBlockIds.has(0)).toBe(true);
    expect(after.parsedBlockIds.has(1)).toBe(false);
    expect(findElements(after.nodes[0], "sup")).toHaveLength(1);
  });
});

describe("raw HTML policy", () => {
  it("turns a scroll anchor into an empty <a id> with no text", () => {
    const node = parseBlock(createBlocks(['<a id="section-1"></a>'])[0]);
    const anchors = findElements(node, "a");
    expect(anchors).toHaveLength(1);
    expect(anchors[0].properties?.id).toBe("section-1");
    expect(findElements(node, "div")).toHaveLength(0);
    expect(collectNodes(node, "raw")).toHaveLength(0);
    expect(extractText(node)).toBe("");
  });

  it("drops comments and unknown HTML instead of emitting empty wrappers", () => {
    expect(parseBlock(createBlocks(["<!-- hidden -->"])[0]).children).toEqual([]);
    expect(parseBlock(createBlocks(["<div>Hello</div>"])[0]).children).toEqual([]);
    const inline = parseBlock(makeBlock("press <kbd>Ctrl</kbd> now"));
    expect(collectNodes(inline, "raw")).toHaveLength(0);
    expect(findElements(inline, "div")).toHaveLength(0);
    expect(extractText(inline)).toBe("press Ctrl now");
  });

  it("keeps <br> as a line break that measurement can see", () => {
    const node = parseBlock(makeBlock("line one<br>line two"));
    expect(findElements(node, "br")).toHaveLength(1);
    expect(extractText(node)).toBe("line one\nline two");
  });

  it("rejects anchors carrying anything but an id", () => {
    const node = parseBlock(makeBlock('<a id="x" onclick="alert(1)"></a>'));
    expect(findElements(node, "a")).toHaveLength(0);
  });
});

describe("URL sanitization", () => {
  it("drops javascript:, vbscript: and data: destinations but keeps safe ones", () => {
    const node = parseBlock(
      makeBlock(
        "[a](javascript:alert(1)) [b](VBScript:x) ![c](data:text/html,x) [d](https://ok.com) [e](/rel?q=a:b) [f](#frag) [g](mailto:x@y.z)",
      ),
    );
    expect(findElements(node, "a").map((a) => a.properties?.href)).toEqual([
      undefined,
      undefined,
      "https://ok.com",
      "/rel?q=a:b",
      "#frag",
      "mailto:x@y.z",
    ]);
    expect(findElements(node, "img")[0].properties?.src).toBeUndefined();
    expect(extractText(node)).toContain("a b");
  });

  it("neutralizes entity-encoded and control-character schemes", () => {
    const node = parseBlock(
      makeBlock("[a](&#106;avascript:alert(1)) [b](<java&#9;script:alert(1)>)"),
    );
    const links = findElements(node, "a");
    expect(links.length).toBeGreaterThan(0);
    expect(links.map((a) => a.properties?.href)).toEqual(links.map(() => undefined));
  });
});

describe("inline math delimiters", () => {
  const mathValues = (text: string) =>
    collectNodes(parseBlock(makeBlock(text)), "inlineMath").map((m) => m.value);

  it("does not pair a currency $ with a later math opener", () => {
    const node = parseBlock(makeBlock("It costs $5 and the formula is $x^2$."));
    expect(collectNodes(node, "inlineMath").map((m) => m.value)).toEqual(["x^2"]);
    expect(extractText(node)).toBe("It costs $5 and the formula is x^2.");
  });

  it("keeps shell variables and currency ranges literal", () => {
    for (const text of [
      "I have $5 and $ten",
      "use $PATH and $HOME vars",
      "Between $100 and $200, then done",
      "prices ($5) and ($6)",
    ]) {
      expect(mathValues(text), text).toEqual([]);
    }
  });

  it("still recognizes math after a currency range", () => {
    expect(mathValues("Between $100 and $200, then $E=mc^2$ holds")).toEqual(["E=mc^2"]);
  });

  it("keeps a link whose text contains a currency amount", () => {
    const node = parseBlock(makeBlock("[cost $5](http://a.com) and $x$"));
    expect(findElements(node, "a").map((a) => a.properties?.href)).toEqual(["http://a.com"]);
    expect(collectNodes(node, "inlineMath").map((m) => m.value)).toEqual(["x"]);
  });

  it("leaves $ inside autolinks and bare URLs alone", () => {
    const node = parseBlock(makeBlock("<http://a.com/$x> and https://b.com/$y then $z$"));
    expect(findElements(node, "a").map((a) => a.properties?.href)).toEqual([
      "http://a.com/$x",
      "https://b.com/$y",
    ]);
    expect(collectNodes(node, "inlineMath").map((m) => m.value)).toEqual(["z"]);
  });

  it("restores placeholders that land in image alt text", () => {
    const node = parseBlock(makeBlock("![$x$](img.png)"));
    expect(findElements(node, "img")[0].properties?.alt).toBe("$x$");
  });

  it("keeps scanning past an unclosed link destination", () => {
    const node = parseBlock(makeBlock("[a](unclosed and [b](/docs/$id$/) then $y$"));
    expect(findElements(node, "a").map((a) => a.properties?.href)).toEqual(["/docs/$id$/"]);
    expect(collectNodes(node, "inlineMath").map((m) => m.value)).toEqual(["y"]);
  });
});
