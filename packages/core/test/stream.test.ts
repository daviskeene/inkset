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
