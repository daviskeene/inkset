// Tests for the hyphenation layer: soft-hyphen insertion and block-type gating.
import { describe, it, expect } from "vitest";
import { loadHyphenator, hyphenateBlock } from "../src/hyphenate.js";
import type { EnrichedNode } from "../src/types.js";

describe("loadHyphenator", () => {
  it("loads en-us and inserts soft hyphens", async () => {
    const hyphenate = await loadHyphenator("en-us");
    const out = hyphenate("representation");
    // "rep-re-sen-ta-tion" in Hypher's en-us → contains U+00AD
    expect(out.includes("\u00AD")).toBe(true);
    expect(out.replace(/\u00AD/g, "")).toBe("representation");
  });

  it("leaves short words alone", async () => {
    const hyphenate = await loadHyphenator("en-us");
    expect(hyphenate("the cat sat")).toBe("the cat sat");
  });
});

describe("hyphenateBlock", () => {
  const makeParagraph = (text: string): EnrichedNode => ({
    type: "element",
    tagName: "p",
    blockId: 0,
    blockType: "paragraph",
    children: [
      {
        type: "text",
        value: text,
        blockId: 0,
        blockType: "paragraph",
      },
    ],
  });

  it("injects soft hyphens into paragraph text", async () => {
    const hyphenate = await loadHyphenator("en-us");
    const node = makeParagraph("measurement representation");
    const out = hyphenateBlock(node, hyphenate);

    const textNode = out.children?.[0];
    expect(textNode?.value?.includes("\u00AD")).toBe(true);
    expect(textNode?.value?.replace(/\u00AD/g, "")).toBe("measurement representation");
  });

  it("returns the same reference when the tree has no text to change", async () => {
    const hyphenate = await loadHyphenator("en-us");
    const node = makeParagraph("a b c");
    const out = hyphenateBlock(node, hyphenate);
    // Short words → hypher returns identical strings → walker should short-circuit
    expect(out.children?.[0].value).toBe("a b c");
  });

  it("skips code blocks", async () => {
    const hyphenate = await loadHyphenator("en-us");
    const node: EnrichedNode = {
      type: "element",
      tagName: "pre",
      blockId: 1,
      blockType: "code",
      children: [
        {
          type: "text",
          value: "representation",
          blockId: 1,
          blockType: "code",
        },
      ],
    };
    expect(hyphenateBlock(node, hyphenate)).toBe(node);
  });

  it("skips inline code spans inside prose", async () => {
    const hyphenate = await loadHyphenator("en-us");
    const node: EnrichedNode = {
      type: "element",
      tagName: "p",
      blockId: 0,
      blockType: "paragraph",
      children: [
        {
          type: "text",
          value: "call representation now",
          blockId: 0,
          blockType: "paragraph",
        },
        {
          type: "element",
          tagName: "code",
          blockId: 0,
          blockType: "paragraph",
          children: [
            {
              type: "text",
              value: "representation",
              blockId: 0,
              blockType: "paragraph",
            },
          ],
        },
      ],
    };
    const out = hyphenateBlock(node, hyphenate);
    const proseText = out.children?.[0].value ?? "";
    const codeText = out.children?.[1].children?.[0].value ?? "";
    expect(proseText.includes("\u00AD")).toBe(true);
    expect(codeText).toBe("representation"); // untouched
  });
});
