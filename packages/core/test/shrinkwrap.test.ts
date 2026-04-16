// Tests for the shrinkwrap pipeline option. Pretext isn't available in Node
// (no Canvas), so measureShrinkwrapWidth returns null and shrinkwrapWidth
// stays unset. We instead verify the option is threaded correctly and that
// the pipeline doesn't crash when pretext is absent.
import { describe, it, expect } from "vitest";
import { StreamingPipeline } from "../src/stream.js";

describe("shrinkwrap option", () => {
  it("defaults to false and leaves shrinkwrapWidth unset", async () => {
    const pipeline = new StreamingPipeline();
    await pipeline.setWidth(600);
    await pipeline.setContent("# A heading\n\nA paragraph of text that spans enough chars to wrap at narrow widths, probably.");

    const state = pipeline.getState();
    for (const block of state.layout) {
      expect(block.shrinkwrapWidth).toBeUndefined();
    }
  });

  it("accepts shrinkwrap={true|'headings'|'paragraphs'} without crashing", async () => {
    for (const mode of [true, "headings", "paragraphs"] as const) {
      const pipeline = new StreamingPipeline({ shrinkwrap: mode });
      await pipeline.setWidth(600);
      await pipeline.setContent("# Title\n\nBody paragraph here.");
      const state = pipeline.getState();
      expect(state.blockCount).toBe(2);
      // In Node without Canvas, pretext falls back and shrinkwrapWidth stays unset.
      for (const block of state.layout) {
        expect(block.shrinkwrapWidth === undefined || typeof block.shrinkwrapWidth === "number").toBe(true);
      }
    }
  });
});
