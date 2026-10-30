// Guards for the streaming hot paths: per-token cost must not depend on the
// document's length, and a relayout must reuse every prepared handle no matter
// how large the document or how long it streamed.
import { afterEach, describe, expect, it, vi } from "vitest";

const { prepare } = vi.hoisted(() => ({
  prepare: vi.fn((text: string, font: string) => ({ text, font })),
}));

vi.mock("@chenglou/pretext", () => ({
  prepare,
  prepareWithSegments: (text: string, font: string) => ({ text, font, segments: [text] }),
  layout: (_prepared: unknown, maxWidth: number) => ({
    height: maxWidth < 500 ? 48 : 24,
    lineCount: maxWidth < 500 ? 2 : 1,
  }),
  layoutWithLines: () => ({ height: 24, lineCount: 1, lines: [] }),
  measureLineStats: () => ({ lineCount: 1, maxLineWidth: 200 }),
  measureNaturalWidth: () => 200,
}));

import { Ingest } from "../src/ingest.js";
import { StreamingPipeline } from "../src/stream.js";
import type { MeasureLayer } from "../src/measure.js";

const flushScheduledUpdate = () => new Promise((resolve) => setTimeout(resolve, 5));
const cacheSizeOf = (pipeline: StreamingPipeline) =>
  (pipeline as unknown as { measureLayer: MeasureLayer }).measureLayer.cacheStats.size;

const paragraphs = (count: number) =>
  Array.from({ length: count }, (_, i) => `Paragraph ${i} with some words in it.`).join("\n\n");

afterEach(() => {
  prepare.mockClear();
  vi.restoreAllMocks();
});

describe("token append", () => {
  it("does not re-split the document for every token", async () => {
    const pipeline = new StreamingPipeline();
    await pipeline.setWidth(600);
    await pipeline.setContent("", { streaming: true });

    // `Ingest.append` splits the whole document to report block events; the
    // pipeline only needs the text, so a stream must never pay for it.
    const append = vi.spyOn(Ingest.prototype, "append");
    for (const token of "First paragraph.\n\nSecond paragraph with more words.".match(
      /.{1,3}/gs,
    )!) {
      await pipeline.appendToken(token);
    }
    await flushScheduledUpdate();

    expect(append).not.toHaveBeenCalled();
    expect(pipeline.getState().blockCount).toBe(2);
    pipeline.destroy();
  });

  it("keeps the public Ingest.append event API", () => {
    const ingest = new Ingest();
    expect(ingest.append("Hello")).toEqual([{ type: "block:new", blockId: 0 }]);
    expect(ingest.appendText(" world")).toBe(true);
    expect(ingest.getRaw()).toBe("Hello world");
    ingest.end();
    expect(ingest.appendText("late")).toBe(false);
  });
});

describe("relayout reuses prepared handles", () => {
  it("re-prepares nothing when the document has more texts than the cache holds", async () => {
    const pipeline = new StreamingPipeline({ cacheSize: 20 });
    await pipeline.setWidth(800);
    await pipeline.setContent(paragraphs(60));
    const preparedOnce = prepare.mock.calls.length;
    expect(preparedOnce).toBe(60);
    const wideHeight = pipeline.getState().totalHeight;

    await pipeline.setWidth(400);
    // The narrow width really was laid out again (two lines per block).
    expect(pipeline.getState().totalHeight).toBe(wideHeight + 60 * 24);
    await pipeline.setWidth(700);

    expect(prepare.mock.calls.length).toBe(preparedOnce);
    pipeline.destroy();
  });

  it("re-prepares nothing on the first resize after a long stream", async () => {
    const pipeline = new StreamingPipeline({ cacheSize: 20 });
    await pipeline.setWidth(800);
    await pipeline.setContent("", { streaming: true });

    const doc = `${paragraphs(4)}\n\n${"streaming words ".repeat(60)}`;
    for (let i = 0; i < doc.length; i += 16) {
      await pipeline.appendToken(doc.slice(i, i + 16));
      await flushScheduledUpdate();
    }
    await pipeline.endStream();

    // Each frame re-measured the growing hot block; none of those prefixes may
    // occupy the shared cache, where they used to evict the frozen blocks.
    expect(cacheSizeOf(pipeline)).toBeLessThanOrEqual(5);

    const prepared = prepare.mock.calls.length;
    const heightBefore = pipeline.getState().totalHeight;
    await pipeline.setWidth(400);

    expect(prepare.mock.calls.length).toBe(prepared);
    expect(pipeline.getState().totalHeight).toBeGreaterThan(heightBefore);
    pipeline.destroy();
  });
});

describe("shrinkwrap on resize", () => {
  it("reuses each block's segment handle instead of re-preparing", async () => {
    const pretext = await import("@chenglou/pretext");
    const prepareWithSegments = vi.spyOn(pretext, "prepareWithSegments");
    const pipeline = new StreamingPipeline({ shrinkwrap: true });
    await pipeline.setWidth(800);
    await pipeline.setContent(paragraphs(10));
    const prepared = prepareWithSegments.mock.calls.length;
    expect(prepared).toBe(10);

    await pipeline.setWidth(400);

    expect(prepareWithSegments.mock.calls.length).toBe(prepared);
    pipeline.destroy();
  });
});
