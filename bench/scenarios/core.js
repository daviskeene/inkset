// Core pipeline scenarios. Runs in a real browser so pretext measures text
// with Canvas, exactly as it does in an app.
import { StreamingPipeline } from "@inkset/core";
import { makeMarkdown, stats, tokenize } from "../fixture.js";

const FONT = "Helvetica, Arial, sans-serif";
const WIDTH = 720;
// Characters delivered per frame: ~1900 chars/s at 60 fps, a fast model.
const CHARS_PER_FRAME = 32;

// The pipeline schedules its own runs on requestAnimationFrame. To time each
// run on its own, the bench cancels that frame and runs the pipeline directly
// (both are private methods; this file is the only place that reaches in).
const runFrame = async (pipeline) => {
  pipeline.cancelPendingUpdate();
  const start = performance.now();
  await pipeline.runPipeline();
  return performance.now() - start;
};

const stream = async (chars) => {
  const tokens = tokenize(makeMarkdown(chars));
  const pipeline = new StreamingPipeline({ font: FONT, plugins: [] });
  await pipeline.init();
  await pipeline.setWidth(WIDTH);
  await pipeline.setContent("", { streaming: true });

  let appendMs = 0;
  let buffered = 0;
  const frames = [];
  for (let i = 0; i < tokens.length; i++) {
    const start = performance.now();
    pipeline.appendToken(tokens[i]);
    appendMs += performance.now() - start;
    buffered += tokens[i].length;
    if (buffered >= CHARS_PER_FRAME || i === tokens.length - 1) {
      buffered = 0;
      frames.push(await runFrame(pipeline));
    }
  }
  await pipeline.endStream();

  const resizeStart = performance.now();
  await pipeline.setWidth(WIDTH - 80);
  const firstResizeMs = performance.now() - resizeStart;

  const result = {
    chars,
    blocks: pipeline.getState().blockCount,
    appendPerTokenUs: Math.round((appendMs / tokens.length) * 1000 * 100) / 100,
    appendTotalMs: Math.round(appendMs * 10) / 10,
    pipelinePerFrameMs: stats(frames),
    firstResizeAfterStreamMs: Math.round(firstResizeMs * 100) / 100,
  };
  pipeline.destroy();
  return result;
};

const relayout = async (blockCount) => {
  const parts = [];
  for (let i = 0; i < blockCount; i++) {
    parts.push(
      i % 10 === 0
        ? `## Heading ${i}`
        : i % 5 === 0
          ? `- item ${i} alpha beta\n- item two gamma`
          : `Paragraph ${i}: the pipeline measures each block once and then reflows with arithmetic.`,
    );
  }
  const pipeline = new StreamingPipeline({ font: FONT, plugins: [] });
  await pipeline.init();
  await pipeline.setWidth(WIDTH);
  await pipeline.setContent(parts.join("\n\n"));

  const times = [];
  for (let k = 0; k < 30; k++) {
    const start = performance.now();
    await pipeline.setWidth(400 + ((k * 37) % 320));
    times.push(performance.now() - start);
  }
  pipeline.destroy();
  return { blocks: blockCount, relayoutMs: stats(times.slice(5)) };
};

export const run = async () => {
  await stream(6000); // warm up the JIT and pretext's glyph caches
  return {
    stream12k: await stream(12000),
    stream60k: await stream(60000),
    relayout500: await relayout(500),
    relayout1000: await relayout(1000),
  };
};
