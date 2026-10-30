// Measures the JavaScript each /compare column loads up front: its renderer and
// plugins, minified and gzipped, with React excluded because every column
// shares it. Chunks the libraries import dynamically (Shiki languages, Mermaid)
// are not counted. CSS files are excluded too, which counts against Inkset:
// its stylesheet ships inside its JavaScript.
//
// Run after upgrading any of these packages, and commit the result:
//   pnpm --filter @inkset/playground measure:bundles
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(root, "src/app/compare/bundle-sizes.json");

// Each entry imports what its column on /compare imports.
const COLUMNS = {
  inkset: {
    version: "@inkset/react",
    source: `
      import { Inkset } from "@inkset/react";
      import { createCodePlugin } from "@inkset/code";
      import { createMathPlugin } from "@inkset/math";
      import { createTablePlugin } from "@inkset/table";
      import { createDiagramPlugin } from "@inkset/diagram";
      export default [Inkset, createCodePlugin(), createMathPlugin(), createTablePlugin(), createDiagramPlugin()];
    `,
  },
  "react-markdown": {
    version: "react-markdown",
    source: `
      import ReactMarkdown from "react-markdown";
      import remarkGfm from "remark-gfm";
      import remarkMath from "remark-math";
      import rehypeKatex from "rehype-katex";
      import rehypeHighlight from "rehype-highlight";
      export default [ReactMarkdown, remarkGfm, remarkMath, rehypeKatex, rehypeHighlight];
    `,
  },
  streamdown: {
    version: "streamdown",
    source: `
      import { Streamdown } from "streamdown";
      import { math } from "@streamdown/math";
      import { mermaid } from "@streamdown/mermaid";
      import { createCodePlugin } from "@streamdown/code";
      export default [Streamdown, math, mermaid, createCodePlugin({ themes: ["github-dark", "github-dark"] })];
    `,
  },
};

const STATIC_IMPORT = /import\s*(?:[\w$*{}\s,]*?from\s*)?"\.\/([^"]+\.js)"/g;

const measureUpFront = async (source) => {
  // Splitting needs a real entry point, so the source goes in through a plugin.
  const result = await build({
    entryPoints: ["entry"],
    bundle: true,
    format: "esm",
    splitting: true,
    minify: true,
    platform: "browser",
    write: false,
    outdir: "out",
    external: ["react", "react-dom", "react/jsx-runtime"],
    loader: { ".css": "empty" },
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "error",
    plugins: [
      {
        name: "entry",
        setup(b) {
          b.onResolve({ filter: /^entry$/ }, () => ({ path: "entry", namespace: "entry" }));
          b.onLoad({ filter: /.*/, namespace: "entry" }, () => ({
            contents: source,
            resolveDir: root,
            loader: "js",
          }));
        },
      },
    ],
  });
  const files = new Map(result.outputFiles.map((file) => [path.basename(file.path), file]));
  const upFront = new Set();
  const visit = (name) => {
    if (upFront.has(name) || !files.has(name)) return;
    upFront.add(name);
    for (const match of files.get(name).text.matchAll(STATIC_IMPORT)) visit(match[1]);
  };
  visit("entry.js");
  const bytes = [...upFront].reduce(
    (sum, name) => sum + gzipSync(files.get(name).contents).length,
    0,
  );
  return Math.round(bytes / 1024);
};

const versionOf = (name) =>
  JSON.parse(readFileSync(path.join(root, "node_modules", name, "package.json"), "utf8")).version;

const sizes = {};
for (const [key, column] of Object.entries(COLUMNS)) {
  sizes[key] = {
    version: versionOf(column.version),
    upFrontKb: await measureUpFront(column.source),
  };
}
writeFileSync(output, `${JSON.stringify(sizes, null, 2)}\n`);
console.log(sizes);
