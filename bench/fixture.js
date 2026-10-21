// Deterministic stand-in for a long model answer: headings, prose with inline
// code/links/bold, nested lists, fenced code, tables and blockquotes.
const WORDS = (
  "the pipeline measures each block once and then reflows with arithmetic so frozen content " +
  "never moves while new tokens stream into the hot block at the bottom of the response which " +
  "keeps reading stable even on slow phones"
).split(" ");

let seed = 7;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const word = () => WORDS[Math.floor(rand() * WORDS.length)];

const sentence = (n) => {
  const words = Array.from({ length: n }, word);
  words[0] = words[0][0].toUpperCase() + words[0].slice(1);
  if (rand() < 0.3) words[2] = `**${words[2]}**`;
  if (rand() < 0.3) words[4] = `\`${words[4]}()\``;
  if (rand() < 0.15) words[6] = `[${words[6]}](https://example.com/${words[6]})`;
  return `${words.join(" ")}.`;
};

const paragraph = () =>
  Array.from({ length: 3 + Math.floor(rand() * 3) }, () =>
    sentence(12 + Math.floor(rand() * 10)),
  ).join(" ");

const code = (i) => {
  const lines = [i % 2 ? "```ts" : "```python"];
  for (let l = 0; l < 18; l++) {
    lines.push(
      i % 2
        ? `  const value${l} = await pipeline.measure(blocks[${l}], { width: ${320 + l * 8} }); // ${word()}`
        : `    result_${l} = layout(blocks[${l}], width=${320 + l * 8})  # ${word()} ${word()}`,
    );
  }
  lines.push("```");
  return lines.join("\n");
};

const table = () => {
  const rows = ["| Stage | Cost | Notes |", "| --- | ---: | --- |"];
  for (let r = 0; r < 6; r++) {
    rows.push(`| ${word()} | ${(rand() * 10).toFixed(2)} ms | ${sentence(5)} |`);
  }
  return rows.join("\n");
};

const list = () =>
  Array.from({ length: 5 }, (_, i) =>
    i === 2 ? `- ${sentence(9)}\n  - ${sentence(6)}\n  - ${sentence(7)}` : `- ${sentence(10)}`,
  ).join("\n");

const orderedList = () =>
  Array.from({ length: 4 }, (_, i) => `${i + 1}. ${sentence(11)}`).join("\n");

const section = (i) =>
  [
    `## ${i + 1}. ${sentence(4).replace(/\*|`|\[|\]|\(.*?\)/g, "")}`,
    paragraph(),
    paragraph(),
    list(),
    i % 3 === 0 ? code(i) : paragraph(),
    i % 4 === 1 ? table() : `> ${sentence(14)}`,
    orderedList(),
    paragraph(),
  ].join("\n\n");

/** A document of at least `targetChars` characters. Same input, same output. */
export const makeMarkdown = (targetChars) => {
  seed = 7;
  const parts = ["# Streaming layout report", paragraph()];
  let i = 0;
  while (parts.join("\n\n").length < targetChars) parts.push(section(i++));
  return `${parts.join("\n\n")}\n`;
};

/** Splits text into model-sized tokens of 2–6 characters, deterministically. */
export const tokenize = (text) => {
  const tokens = [];
  let size = 3;
  for (let i = 0; i < text.length; i += 2 + size) {
    size = (size * 7 + 3) % 5;
    tokens.push(text.slice(i, i + 2 + size));
  }
  return tokens;
};

export const stats = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const sum = sorted.reduce((a, b) => a + b, 0);
  const round = (n) => Math.round(n * 1000) / 1000;
  return {
    n: sorted.length,
    mean: round(sum / sorted.length),
    p50: round(pick(0.5)),
    p95: round(pick(0.95)),
    max: round(sorted[sorted.length - 1]),
    sum: round(sum),
  };
};
