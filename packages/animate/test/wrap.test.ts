import { describe, it, expect } from "vitest";
import { wrapBlockDelta, splitByWord, splitByChar } from "../src/wrap";
import type { EnrichedNode } from "@inkset/core";

// ── Helpers ────────────────────────────────────────────────────────

const mkText = (value: string): EnrichedNode => ({
  type: "text",
  value,
  blockId: 0,
  blockType: "paragraph",
});

const mkElement = (
  tagName: string,
  children: EnrichedNode[],
  extras: Partial<EnrichedNode> = {},
): EnrichedNode => ({
  type: "element",
  tagName,
  children,
  blockId: 0,
  blockType: "paragraph",
  ...extras,
});

const collectTokenChunks = (node: EnrichedNode): string[] => {
  const out: string[] = [];
  const walk = (n: EnrichedNode) => {
    if (n.type === "element" && n.properties?.["data-inkset-reveal-token"] === "") {
      const text = n.children?.[0]?.value ?? "";
      out.push(text);
      return;
    }
    if (n.children) {
      for (const child of n.children) walk(child as EnrichedNode);
    }
  };
  walk(node);
  return out;
};

const countRevealSpans = (node: EnrichedNode): number =>
  collectTokenChunks(node).length;

// Reconstruct the visible text from the wrapped tree (plain text + span text).
const flattenText = (node: EnrichedNode): string => {
  if (node.type === "text") return node.value ?? "";
  if (!node.children) return "";
  return node.children.map((c) => flattenText(c as EnrichedNode)).join("");
};

// ── splitByWord / splitByChar ─────────────────────────────────────

describe("splitByWord", () => {
  it("splits into alternating word and whitespace runs", () => {
    expect(splitByWord("hello world foo")).toEqual([
      { text: "hello", animate: true },
      { text: " ", animate: false },
      { text: "world", animate: true },
      { text: " ", animate: false },
      { text: "foo", animate: true },
    ]);
  });

  it("handles multiple spaces between words", () => {
    expect(splitByWord("a  b")).toEqual([
      { text: "a", animate: true },
      { text: "  ", animate: false },
      { text: "b", animate: true },
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(splitByWord("")).toEqual([]);
  });

  it("preserves newlines as whitespace", () => {
    expect(splitByWord("line1\nline2")).toEqual([
      { text: "line1", animate: true },
      { text: "\n", animate: false },
      { text: "line2", animate: true },
    ]);
  });
});

describe("splitByChar", () => {
  it("splits single codepoints", () => {
    expect(splitByChar("abc")).toEqual(["a", "b", "c"]);
  });

  it("keeps astral codepoints as one chunk", () => {
    expect(splitByChar("a🎉b")).toEqual(["a", "🎉", "b"]);
  });
});

// ── wrapBlockDelta ────────────────────────────────────────────────

describe("wrapBlockDelta — first-tick reveal", () => {
  it("wraps every word when starting from offset 0", () => {
    const node = mkElement("p", [mkText("hello world")]);
    const { node: out, newOffset, tokenCount } = wrapBlockDelta(node, {
      revealedOffset: 0,
      tickId: 1,
      staggerMs: 30,
      sep: "word",
    });

    expect(newOffset).toBe("hello world".length);
    expect(tokenCount).toBe(2);
    expect(collectTokenChunks(out)).toEqual(["hello", "world"]);
    expect(flattenText(out)).toBe("hello world");
  });

  it("assigns incrementing stagger delays to spans", () => {
    const node = mkElement("p", [mkText("a b c")]);
    const { node: out } = wrapBlockDelta(node, {
      revealedOffset: 0,
      tickId: 1,
      staggerMs: 50,
      sep: "word",
    });

    const delays: string[] = [];
    const walk = (n: EnrichedNode) => {
      if (n.type === "element" && n.properties?.["data-inkset-reveal-token"] === "") {
        const style = n.properties["style"] as Record<string, string>;
        delays.push(style["--inkset-reveal-delay"]);
      }
      if (n.children) for (const c of n.children) walk(c as EnrichedNode);
    };
    walk(out);
    expect(delays).toEqual(["0ms", "50ms", "100ms"]);
  });
});

describe("wrapBlockDelta — delta detection", () => {
  it("leaves already-revealed text untouched when offset covers the block", () => {
    const node = mkElement("p", [mkText("hello world")]);
    const { node: out, tokenCount } = wrapBlockDelta(node, {
      revealedOffset: "hello world".length,
      tickId: 2,
      staggerMs: 30,
      sep: "word",
    });

    expect(tokenCount).toBe(0);
    expect(out).toBe(node); // same reference — no mutation when nothing changed
    expect(countRevealSpans(out)).toBe(0);
  });

  it("splits a text node mid-content when the offset lands inside it", () => {
    const node = mkElement("p", [mkText("hello world foo")]);
    const { node: out, newOffset, tokenCount } = wrapBlockDelta(node, {
      // "hello " = 6 chars already revealed
      revealedOffset: 6,
      tickId: 2,
      staggerMs: 30,
      sep: "word",
    });

    expect(newOffset).toBe("hello world foo".length);
    expect(tokenCount).toBe(2); // "world" and "foo"
    expect(collectTokenChunks(out)).toEqual(["world", "foo"]);
    expect(flattenText(out)).toBe("hello world foo");
  });

  it("advances past inline element boundaries in DFS order", () => {
    const node = mkElement("p", [
      mkText("hello "),
      mkElement("strong", [mkText("world")]),
      mkText(" foo"),
    ]);
    // Reveal "hello " (6 chars), leaving "world" inside <strong> and " foo" as fresh.
    const { node: out, newOffset, tokenCount } = wrapBlockDelta(node, {
      revealedOffset: 6,
      tickId: 3,
      staggerMs: 30,
      sep: "word",
    });

    expect(newOffset).toBe("hello world foo".length);
    expect(tokenCount).toBeGreaterThanOrEqual(2);
    expect(flattenText(out)).toBe("hello world foo");
  });
});

describe("wrapBlockDelta — skip rules", () => {
  it("skips <code> content but advances offset", () => {
    const node = mkElement("p", [
      mkText("before "),
      mkElement("code", [mkText("inline()")]),
      mkText(" after"),
    ]);
    const { node: out, newOffset } = wrapBlockDelta(node, {
      revealedOffset: 0,
      tickId: 1,
      staggerMs: 30,
      sep: "word",
    });

    // code subtree should have NO reveal spans inside it.
    const code = (out.children ?? []).find(
      (c) => (c as EnrichedNode).tagName === "code",
    ) as EnrichedNode | undefined;
    expect(code).toBeDefined();
    expect(countRevealSpans(code!)).toBe(0);

    expect(newOffset).toBe("before inline() after".length);
    expect(flattenText(out)).toBe("before inline() after");
  });

  it("passes plugin-transformed subtrees through unchanged", () => {
    const codeBlock = mkElement("pre", [mkElement("code", [mkText("let x = 1;")])], {
      transformedBy: "code",
    });
    const root = mkElement("div", [codeBlock]);

    const { node: out, newOffset, tokenCount } = wrapBlockDelta(root, {
      revealedOffset: 0,
      tickId: 1,
      staggerMs: 30,
      sep: "word",
    });

    expect(tokenCount).toBe(0);
    expect(newOffset).toBe("let x = 1;".length);
    // Subtree identity preserved
    expect(out.children?.[0]).toBe(codeBlock);
  });
});

describe("wrapBlockDelta — char sep", () => {
  it("emits one span per codepoint in char mode", () => {
    const node = mkElement("p", [mkText("abc")]);
    const { tokenCount, node: out } = wrapBlockDelta(node, {
      revealedOffset: 0,
      tickId: 1,
      staggerMs: 30,
      sep: "char",
    });

    expect(tokenCount).toBe(3);
    expect(collectTokenChunks(out)).toEqual(["a", "b", "c"]);
  });
});

// ── Phase 3: layout-order stagger ────────────────────────────────

import type { GlyphPositionLookup, TokenCoord } from "@inkset/core";

type TokenSpanInfo = {
  text: string;
  delay: number;
  layoutIndex: number;
  coord: { x?: string; y?: string; w?: string; h?: string };
};

const collectSpans = (node: EnrichedNode): TokenSpanInfo[] => {
  const out: TokenSpanInfo[] = [];
  const walk = (n: EnrichedNode) => {
    if (
      n.type === "element" &&
      n.properties?.["data-inkset-reveal-token"] === ""
    ) {
      const text = (n.children?.[0] as EnrichedNode | undefined)?.value ?? "";
      const style = n.properties["style"] as Record<string, string>;
      const delay = parseInt(
        (style["--inkset-reveal-delay"] ?? "0ms").replace("ms", ""),
        10,
      );
      out.push({
        text,
        delay,
        layoutIndex: parseInt(
          (n.properties["data-inkset-reveal-index"] as string) ?? "-1",
          10,
        ),
        coord: {
          x: n.properties["data-inkset-reveal-x"] as string | undefined,
          y: n.properties["data-inkset-reveal-y"] as string | undefined,
          w: n.properties["data-inkset-reveal-w"] as string | undefined,
          h: n.properties["data-inkset-reveal-h"] as string | undefined,
        },
      });
      return;
    }
    if (n.children) for (const c of n.children) walk(c as EnrichedNode);
  };
  walk(node);
  return out;
};

// Minimal stub lookup: returns a fixed coord per (offsetStart, offsetEnd).
const makeStubLookup = (
  entries: Array<{ start: number; end: number; coord: TokenCoord | null }>,
): GlyphPositionLookup => ({
  lineCount: 1,
  locate(start, end) {
    const hit = entries.find((e) => e.start === start && e.end === end);
    return hit ? hit.coord : null;
  },
});

describe("wrapBlockDelta — layout-order stagger", () => {
  it("sorts tokens by (y, x) with arrival-index tiebreaker", () => {
    // Text: "alpha beta gamma delta" (word offsets 0-5, 6-10, 11-16, 17-22)
    const text = "alpha beta gamma delta";
    const node = mkElement("p", [mkText(text)]);

    // alpha, gamma on line y=0 (x=0, x=40); beta, delta on line y=20 (x=0, x=40)
    const lookup = makeStubLookup([
      { start: 0, end: 5, coord: { x: 0, y: 0, width: 10, height: 20, lineIndex: 0 } },
      { start: 6, end: 10, coord: { x: 0, y: 20, width: 10, height: 20, lineIndex: 1 } },
      { start: 11, end: 16, coord: { x: 40, y: 0, width: 10, height: 20, lineIndex: 0 } },
      { start: 17, end: 22, coord: { x: 40, y: 20, width: 10, height: 20, lineIndex: 1 } },
    ]);

    const { node: out } = wrapBlockDelta(node, {
      revealedOffset: 0,
      tickId: 1,
      staggerMs: 30,
      sep: "word",
      glyphLookup: lookup,
      staggerOrder: "layout",
      maxStaggerSpanMs: 0, // disable clamp
    });

    const spans = collectSpans(out);
    const byText = Object.fromEntries(spans.map((s) => [s.text, s]));

    // Expected layout order: alpha (y=0, x=0), gamma (y=0, x=40), beta (y=20, x=0), delta (y=20, x=40)
    expect(byText.alpha.delay).toBe(0);
    expect(byText.gamma.delay).toBe(30);
    expect(byText.beta.delay).toBe(60);
    expect(byText.delta.delay).toBe(90);
    // Layout index matches delay order.
    expect(byText.alpha.layoutIndex).toBe(0);
    expect(byText.gamma.layoutIndex).toBe(1);
    expect(byText.beta.layoutIndex).toBe(2);
    expect(byText.delta.layoutIndex).toBe(3);
  });

  it("clamps total stagger span to maxStaggerSpanMs", () => {
    // 20 tokens × 30ms = 600ms raw span, clamped to 400ms → step ~21ms.
    const words = Array.from({ length: 20 }, (_, i) => `w${i}`);
    const text = words.join(" ");
    const node = mkElement("p", [mkText(text)]);

    const { node: out } = wrapBlockDelta(node, {
      revealedOffset: 0,
      tickId: 1,
      staggerMs: 30,
      sep: "word",
      // No glyphLookup → arrival order, but clamp still applies.
      glyphLookup: null,
      maxStaggerSpanMs: 400,
    });

    const spans = collectSpans(out);
    const delays = spans.map((s) => s.delay);
    const span = Math.max(...delays) - Math.min(...delays);
    expect(span).toBeLessThanOrEqual(400);
    expect(span).toBeGreaterThan(380); // effective step fills the cap
  });

  it("falls back to arrival order when glyphLookup is null", () => {
    const node = mkElement("p", [mkText("a b c")]);
    const { node: out } = wrapBlockDelta(node, {
      revealedOffset: 0,
      tickId: 1,
      staggerMs: 50,
      sep: "word",
      glyphLookup: null,
      staggerOrder: "layout",
      maxStaggerSpanMs: 0,
    });

    const spans = collectSpans(out);
    expect(spans.map((s) => s.delay)).toEqual([0, 50, 100]);
  });

  it("stashes coord data attrs on spans even in arrival mode", () => {
    const node = mkElement("p", [mkText("alpha beta")]);
    const lookup = makeStubLookup([
      { start: 0, end: 5, coord: { x: 12.3, y: 0, width: 30, height: 18, lineIndex: 0 } },
      { start: 6, end: 10, coord: { x: 48, y: 0, width: 25, height: 18, lineIndex: 0 } },
    ]);
    const { node: out } = wrapBlockDelta(node, {
      revealedOffset: 0,
      tickId: 1,
      staggerMs: 30,
      sep: "word",
      glyphLookup: lookup,
      staggerOrder: "arrival",
    });

    const spans = collectSpans(out);
    expect(spans[0].coord.x).toBe("12.30");
    expect(spans[0].coord.w).toBe("30.00");
    expect(spans[1].coord.x).toBe("48.00");
  });

  it("tokens without coords sort to the end in layout mode", () => {
    const text = "alpha beta gamma"; // offsets 0-5, 6-10, 11-16
    const node = mkElement("p", [mkText(text)]);
    const lookup = makeStubLookup([
      { start: 0, end: 5, coord: { x: 0, y: 0, width: 10, height: 20, lineIndex: 0 } },
      { start: 6, end: 10, coord: null }, // missing coord
      { start: 11, end: 16, coord: { x: 0, y: 20, width: 10, height: 20, lineIndex: 1 } },
    ]);
    const { node: out } = wrapBlockDelta(node, {
      revealedOffset: 0,
      tickId: 1,
      staggerMs: 30,
      sep: "word",
      glyphLookup: lookup,
      staggerOrder: "layout",
      maxStaggerSpanMs: 0,
    });
    const byText = Object.fromEntries(collectSpans(out).map((s) => [s.text, s]));
    // alpha (y=0) first, gamma (y=20) second, beta (no coord) last.
    expect(byText.alpha.layoutIndex).toBe(0);
    expect(byText.gamma.layoutIndex).toBe(1);
    expect(byText.beta.layoutIndex).toBe(2);
  });
});
