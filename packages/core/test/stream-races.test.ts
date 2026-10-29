// Concurrency and lifecycle guarantees of StreamingPipeline. Races are forced
// by gating the measure layer so an in-flight run can be overtaken.
import { describe, expect, it, vi } from "vitest";
import { StreamingPipeline, type PipelineState } from "../src/stream.js";
import { extractText } from "../src/parse.js";
import type { InksetPlugin } from "../src/types.js";

type Gate = { promise: Promise<void>; release: () => void };
const makeGate = (): Gate => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

type MeasureLayerLike = {
  measureBlock: (...args: unknown[]) => Promise<unknown>;
  measureShrinkwrapWidth: (...args: unknown[]) => Promise<unknown>;
};
type Internals = {
  measureLayer: MeasureLayerLike;
  parseCache: Map<number, { node: { transformedBy?: string } }>;
};
const internals = (pipeline: StreamingPipeline): Internals => pipeline as unknown as Internals;

/** Makes the next `count` calls to measureLayer.measureBlock wait on `gate`. */
const gateNextMeasure = (pipeline: StreamingPipeline, gate: Gate, count = 1): void => {
  const layer = internals(pipeline).measureLayer;
  const original = layer.measureBlock.bind(layer);
  let remaining = count;
  layer.measureBlock = async (...args: unknown[]) => {
    if (remaining > 0) {
      remaining--;
      await gate.promise;
    }
    return original(...args);
  };
};

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 10));
const texts = (state: PipelineState): string[] =>
  state.layout.map((block) => extractText(block.node));
const expectConsistent = (state: PipelineState): void => {
  expect(state.blockCount).toBe(state.layout.length);
};

const noopPlugin = (overrides: Partial<InksetPlugin>): InksetPlugin => ({
  name: "test",
  handles: ["code"],
  transform: (node) => node,
  component: () => null,
  ...overrides,
});

const ready = async (options?: ConstructorParameters<typeof StreamingPipeline>[0]) => {
  const pipeline = new StreamingPipeline({ font: "sans-serif", ...options });
  await pipeline.init();
  await pipeline.setWidth(600);
  return pipeline;
};

describe("StreamingPipeline concurrency", () => {
  it("lets a setContent issued during an in-flight run win", async () => {
    const pipeline = await ready();
    const gate = makeGate();
    gateNextMeasure(pipeline, gate);
    const notifications: PipelineState[] = [];
    pipeline.subscribe((state) => notifications.push(state));

    const older = pipeline.setContent("OLD alpha\n\nOLD beta", { streaming: true });
    const newer = pipeline.setContent("NEW gamma");
    await newer;
    gate.release();
    await older;
    await flush();

    expect(texts(pipeline.getState())).toEqual(["NEW gamma"]);
    expectConsistent(pipeline.getState());
    expect(texts(notifications[notifications.length - 1])).toEqual(["NEW gamma"]);
    expect(notifications.some((state) => texts(state)[0] === "OLD alpha")).toBe(false);
    pipeline.destroy();
  });

  it("does not let a relayout overwrite a document that settled underneath it", async () => {
    const pipeline = await ready();
    await pipeline.setContent("Intro para", { streaming: true });
    await pipeline.appendToken("\n\nFinal para");
    const gate = makeGate();
    gateNextMeasure(pipeline, gate);

    const relayout = pipeline.setWidth(500);
    const settle = pipeline.endStream();
    await settle;
    gate.release();
    await relayout;
    await flush();

    const state = pipeline.getState();
    expect(texts(state)).toEqual(["Intro para", "Final para"]);
    expectConsistent(state);
    expect(state.isStreaming).toBe(false);
    expect(state.layout[0].width).toBe(500);
    pipeline.destroy();
  });

  it("re-measures at the latest width when the container resizes during a run", async () => {
    const pipeline = await ready();
    await pipeline.setContent("One\n\nTwo\n\nThree", { streaming: true });
    // Grow the hot block so endStream() has something new to measure (an
    // unchanged last block is a parse-cache hit and never reaches the gate).
    await pipeline.appendToken(" more");
    const gate = makeGate();
    gateNextMeasure(pipeline, gate);

    const settle = pipeline.endStream();
    const relayout = pipeline.setWidth(800);
    await relayout;
    gate.release();
    await settle;
    await flush();

    const state = pipeline.getState();
    expectConsistent(state);
    expect(texts(state)).toEqual(["One", "Two", "Three more"]);
    expect(state.layout.every((block) => block.width === 800)).toBe(true);
    expect(state.isStreaming).toBe(false);
    pipeline.destroy();
  });

  it("shares one initialization across pre-init calls", async () => {
    const pipeline = new StreamingPipeline({ font: "sans-serif" });
    const init = vi.spyOn(pipeline as unknown as { initialize: () => Promise<void> }, "initialize");
    void pipeline.init();
    void pipeline.setContent("a", { streaming: true });
    await pipeline.appendToken("b");
    await flush();
    await pipeline.init();
    expect(init).toHaveBeenCalledTimes(1);
    pipeline.destroy();
  });

  // A plugin's dependency (shiki, katex, mermaid) is large, so it loads only
  // once the document has a block the plugin claims, and only once.
  it("preloads a plugin when a block needs it, not at init", async () => {
    let preloads = 0;
    const pipeline = await ready({
      plugins: [
        noopPlugin({
          preload: async () => {
            preloads++;
          },
        }),
      ],
    });
    await pipeline.setContent("Only prose here.");
    await flush();
    expect(preloads).toBe(0);

    await pipeline.setContent("Some code:\n\n```\nlet a = 1;\n```");
    await flush();
    expect(preloads).toBe(1);

    await pipeline.setContent("More code:\n\n```\nlet b = 2;\n```\n\n```\nlet c = 3;\n```");
    await flush();
    expect(preloads).toBe(1);
    pipeline.destroy();
  });

  // Regression guard: `preload` is optional, and table plugins have none.
  it("commits blocks claimed by a plugin without preload", async () => {
    const pipeline = await ready({ plugins: [noopPlugin({ handles: ["code"] })] });
    await pipeline.setContent("```\nlet a = 1;\n```");
    await flush();
    const state = pipeline.getState();
    expect(state.blockCount).toBe(1);
    expect(state.layout[0].node.transformedBy).toBe("test");
    pipeline.destroy();
  });

  it("preloads every plugin up front with warmPlugins()", async () => {
    const preloaded: string[] = [];
    const pipeline = await ready({
      plugins: ["code", "table"].map((type) =>
        noopPlugin({
          name: type,
          handles: [type],
          preload: async () => {
            preloaded.push(type);
          },
        }),
      ),
    });
    expect(preloaded).toEqual([]);
    await pipeline.warmPlugins();
    expect(preloaded.sort()).toEqual(["code", "table"]);
    pipeline.destroy();
  });

  it("recomputes shrinkwrap when the container width changes", async () => {
    const pipeline = new StreamingPipeline({ font: "sans-serif", shrinkwrap: "paragraphs" });
    await pipeline.init();
    internals(pipeline).measureLayer.measureShrinkwrapWidth = async (...args: unknown[]) => ({
      width: (args[1] as number) - 20,
      lineCount: 2,
    });
    await pipeline.setWidth(300);
    await pipeline.setContent("A paragraph of text.");
    expect(pipeline.getState().layout[0].shrinkwrapWidth).toBe(280);
    await pipeline.setWidth(900);
    expect(pipeline.getState().layout[0].shrinkwrapWidth).toBe(880);
    pipeline.destroy();
  });
});

describe("StreamingPipeline plugin isolation and lifecycle", () => {
  it("isolates a throwing canHandle and still renders the block", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pipeline = await ready({
      plugins: [
        noopPlugin({
          canHandle: () => {
            throw new Error("boom");
          },
        }),
      ],
    });
    await expect(pipeline.setContent("hello\n\n```js\nx\n```")).resolves.toBeUndefined();
    expect(pipeline.getState().blockCount).toBe(2);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    pipeline.destroy();
  });

  it("does not stamp transformedBy onto the cached parse AST", async () => {
    const pipeline = await ready({
      plugins: [noopPlugin({ name: "ident", handles: ["paragraph"] })],
    });
    await pipeline.setContent("hello");
    expect(internals(pipeline).parseCache.get(0)?.node.transformedBy).toBeUndefined();
    expect(pipeline.getState().layout[0].node.transformedBy).toBe("ident");
    pipeline.destroy();
  });

  it("ignores work after destroy()", async () => {
    const pipeline = await ready();
    await pipeline.setContent("x", { streaming: true });
    const { tick } = pipeline.getState();
    pipeline.destroy();
    await pipeline.appendToken("y");
    await flush();
    await pipeline.endStream();
    await pipeline.setContent("z");
    expect(pipeline.getState().tick).toBe(tick);
  });
});
