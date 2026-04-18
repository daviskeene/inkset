// Tests for the LRU cache and measure layer helpers.
import { describe, it, expect } from "vitest";
import { LRUCache, MeasureLayer } from "../src/measure.js";
import type { EnrichedNode } from "../src/types.js";

describe("LRUCache", () => {
  it("stores and retrieves values", () => {
    const cache = new LRUCache(10);
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
  });

  it("returns undefined for missing keys", () => {
    const cache = new LRUCache(10);
    expect(cache.get("missing")).toBeUndefined();
  });

  it("evicts oldest entry when full", () => {
    const cache = new LRUCache(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("d", 4); // should evict "a"

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("d")).toBe(4);
    expect(cache.size).toBe(3);
  });

  it("refreshes access time on get", () => {
    const cache = new LRUCache(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    // Access "a" to refresh it
    cache.get("a");

    // Insert "d" — should evict "b" (oldest not-refreshed)
    cache.set("d", 4);

    expect(cache.get("a")).toBe(1); // refreshed, still here
    expect(cache.get("b")).toBeUndefined(); // evicted
  });

  it("reports size correctly", () => {
    const cache = new LRUCache(10);
    expect(cache.size).toBe(0);
    cache.set("a", 1);
    expect(cache.size).toBe(1);
    cache.set("b", 2);
    expect(cache.size).toBe(2);
  });

  it("clears all entries", () => {
    const cache = new LRUCache(10);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });

  it("checks existence with has()", () => {
    const cache = new LRUCache(10);
    cache.set("a", 1);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
  });

  it("overwrites existing keys", () => {
    const cache = new LRUCache(10);
    cache.set("a", 1);
    cache.set("a", 2);
    expect(cache.get("a")).toBe(2);
    expect(cache.size).toBe(1);
  });
});

const makeListNode = (text: string): EnrichedNode => {
  return {
    type: "element",
    tagName: "ul",
    blockId: 0,
    blockType: "list",
    children: [{ type: "text", value: text, blockId: 0, blockType: "list" }],
  };
};

describe("MeasureLayer", () => {
  it("does not add trailing padding after the final list item", async () => {
    const layer = new MeasureLayer({
      font: "system-ui, sans-serif",
      fontSize: 16,
      lineHeight: 24,
    });

    const single = await layer.measureBlock(makeListNode("Alpha"), 1000);
    const double = await layer.measureBlock(makeListNode("Alpha\nBeta"), 1000);

    expect(single.dimensions.height).toBe(24);
    expect(double.dimensions.height).toBe(24 + 24 + 4);
  });
});
