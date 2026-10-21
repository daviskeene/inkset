// Renderer scenarios: reveal cost per commit, streaming code highlighting, and
// how far the reveal gate trails a fast stream. Uses React's profiling build.
import { createElement as h, Profiler } from "react";
import { createRoot } from "react-dom/client";
import { Inkset } from "@inkset/react";
import { createCodePlugin } from "@inkset/code";
import { makeMarkdown, stats, tokenize } from "../fixture.js";

const FONT = "Helvetica, Arial, sans-serif";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

const mount = () => {
  const element = document.createElement("div");
  element.style.width = "720px";
  document.body.append(element);
  const root = createRoot(element);
  return {
    element,
    root,
    unmount: () => {
      root.unmount();
      element.remove();
    },
  };
};

const observeLongTasks = () => {
  const durations = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) durations.push(entry.duration);
  });
  observer.observe({ entryTypes: ["longtask"] });
  return {
    durations,
    stop: () => observer.disconnect(),
  };
};

/** Streams `markdown` into <Inkset>, `charsPerFrame` characters per frame. */
const streamInto = async (target, markdown, props, charsPerFrame, onRender) => {
  const tokens = tokenize(markdown);
  let content = "";
  const render = (streaming) =>
    target.root.render(
      h(Profiler, { id: "inkset", onRender }, h(Inkset, { ...props, content, streaming })),
    );
  for (let i = 0; i < tokens.length; ) {
    let added = 0;
    while (i < tokens.length && added < charsPerFrame) {
      content += tokens[i];
      added += tokens[i].length;
      i++;
    }
    render(true);
    await nextFrame();
  }
  render(false);
  await sleep(800);
};

const revealCost = async (reveal) => {
  const target = mount();
  const commits = [];
  await streamInto(
    target,
    makeMarkdown(30000),
    { font: FONT, plugins: [], reveal },
    24,
    (_id, _phase, actualDuration) => commits.push(actualDuration),
  );
  target.unmount();
  return { reactCommitMs: stats(commits) };
};

const codeStreaming = async () => {
  const plugins = [createCodePlugin()];
  await plugins[0].preload();
  const lines = Array.from(
    { length: 150 },
    (_, i) =>
      `  const value${i} = await pipeline.measure(blocks[${i}], { width: ${320 + i} }); // note ${i}`,
  );
  const target = mount();
  const longTasks = observeLongTasks();
  await streamInto(
    target,
    `Here is the implementation:\n\n\`\`\`ts\n${lines.join("\n")}\n\`\`\`\n`,
    { font: FONT, plugins },
    24,
    () => {},
  );
  longTasks.stop();
  target.unmount();
  return {
    lines: lines.length,
    longTasks: longTasks.durations.length,
    longTaskTotalMs: Math.round(longTasks.durations.reduce((a, b) => a + b, 0)),
    longestTaskMs: Math.round(Math.max(0, ...longTasks.durations)),
  };
};

const blockText = (element) =>
  [...element.querySelectorAll("[data-block-id]")].reduce(
    (total, block) => total + (block.textContent ?? "").length,
    0,
  );

const revealLag = async (charsPerSecond) => {
  const markdown = makeMarkdown(3000);
  const reference = mount();
  reference.root.render(h(Inkset, { content: markdown, font: FONT, plugins: [] }));
  await sleep(500);
  const fullLength = blockText(reference.element);
  reference.unmount();

  const target = mount();
  const tokens = tokenize(markdown);
  let content = "";
  const render = (streaming) =>
    target.root.render(h(Inkset, { content, streaming, reveal: {}, font: FONT, plugins: [] }));
  const start = performance.now();
  for (const token of tokens) {
    const due = start + (content.length / charsPerSecond) * 1000;
    while (performance.now() < due) await nextFrame();
    content += token;
    render(true);
  }
  render(false);
  const streamEnd = performance.now();
  let lagMs = null;
  while (performance.now() - streamEnd < 120000) {
    await sleep(50);
    if (blockText(target.element) >= fullLength * 0.995) {
      lagMs = performance.now() - streamEnd;
      break;
    }
  }
  target.unmount();
  return {
    words: markdown.split(/\s+/).length,
    streamSeconds: Math.round((streamEnd - start) / 100) / 10,
    lagAfterStreamEndSeconds: lagMs === null ? null : Math.round(lagMs / 100) / 10,
  };
};

export const run = async () => {
  await revealCost(undefined); // warm up
  return {
    revealOff: await revealCost(undefined),
    revealOn: await revealCost({ throttle: false }),
    codeStreaming: await codeStreaming(),
    revealLag: await revealLag(320),
  };
};
