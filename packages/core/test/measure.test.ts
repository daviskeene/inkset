import { describe, it, expect } from "vitest";
import { LRUCache } from "../src/measure.js";

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
