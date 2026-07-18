// Tests for the streaming pipeline: end-to-end content processing and cache invalidation.
import { describe, it, expect } from "vitest";
import { StreamingPipeline } from "../src/stream.js";
import { extractText } from "../src/parse.js";

describe("StreamingPipeline", () => {
  it("invalidates document-scoped caches when replacing content", async () => {
    const pipeline = new StreamingPipeline();
    await pipeline.setWidth(600);

    await pipeline.setContent("# First Title\n\nAlpha paragraph");
    await pipeline.setContent("# Second Title\n\nBeta paragraph");

    const state = pipeline.getState();

    expect(state.blockCount).toBe(2);
    expect(extractText(state.layout[0].node)).toContain("Second Title");
    expect(extractText(state.layout[1].node)).toContain("Beta paragraph");
  });
});

const flushScheduledUpdate = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("StreamingPipeline incremental streaming", () => {
  it("keeps the ingest open with setContent({streaming: true}) and extends via appendToken", async () => {
    const pipeline = new StreamingPipeline();
    await pipeline.setWidth(600);

    await pipeline.setContent("Alpha", { streaming: true });
    expect(pipeline.getState().isStreaming).toBe(true);

    await pipeline.appendToken(" beta");
    await flushScheduledUpdate();
    expect(extractText(pipeline.getState().layout[0].node)).toContain("beta");

    await pipeline.endStream();
    expect(pipeline.getState().isStreaming).toBe(false);
    pipeline.destroy();
  });

  it("treats endStream as a no-op once the document is settled", async () => {
    const pipeline = new StreamingPipeline();
    await pipeline.setWidth(600);
    await pipeline.setContent("Hello world");

    const before = pipeline.getState();
    await pipeline.endStream();
    const after = pipeline.getState();

    expect(after.isStreaming).toBe(false);
    expect(after.tick).toBe(before.tick);
    pipeline.destroy();
  });

  it("resolves \\eqref forward references once the label arrives in a later block", async () => {
    const doc = [
      "As shown in \\eqref{decay}, the amplitude decays.",
      "",
      "Some filler paragraph so the reference block freezes.",
      "",
      "$$",
      "\\begin{equation}A(t) = A_0 e^{-\\lambda t}\\label{decay}\\end{equation}",
      "$$",
    ].join("\n");

    const pipeline = new StreamingPipeline();
    await pipeline.setWidth(600);
    for (let i = 0; i < doc.length; i += 6) {
      await pipeline.appendToken(doc.slice(i, i + 6));
      await flushScheduledUpdate();
    }
    await pipeline.endStream();

    const firstBlockText = extractText(pipeline.getState().layout[0].node);
    expect(firstBlockText).not.toContain("\\eqref");
    expect(firstBlockText).toContain("(1)");
    pipeline.destroy();
  });

  it("reports a real measure-cache hit rate for frozen blocks", async () => {
    const pipeline = new StreamingPipeline();
    await pipeline.setWidth(600);

    await pipeline.setContent("Alpha\n\nBeta\n\nGamma", { streaming: true });
    expect(pipeline.getState().metrics.cacheHitRate).toBe(0);

    // Appending to the hot block re-measures only that block; the two frozen
    // blocks hit the measure cache.
    await pipeline.appendToken(" more");
    await flushScheduledUpdate();
    expect(pipeline.getState().metrics.cacheHitRate).toBeCloseTo(2 / 3);

    await pipeline.endStream();
    pipeline.destroy();
  });
});
