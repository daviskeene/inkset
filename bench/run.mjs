// Runs the benchmark scenarios in headless Chrome against built packages.
//
//   pnpm build && pnpm bench                  # this checkout
//   pnpm bench --root ../inkset-main          # another checkout, for before/after
//   pnpm bench --only core                    # one scenario file
//
// Set CHROME_PATH if Chrome isn't in its default location.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { build } from "esbuild";

const benchDir = dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({
  options: {
    root: { type: "string", default: resolve(benchDir, "..") },
    only: { type: "string" },
  },
});
const root = resolve(args.root);
const scenarios = ["core", "react"].filter((name) => !args.only || args.only === name);

const findChrome = () => {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }
  for (const name of ["google-chrome", "chromium", "chromium-browser"]) {
    try {
      return execFileSync("which", [name], { encoding: "utf8" }).trim();
    } catch {
      // try the next name
    }
  }
  throw new Error("Chrome not found; set CHROME_PATH.");
};

const bundle = async (scenario, outDir) => {
  const packages = ["core", "react", "animate", "code"];
  await build({
    stdin: {
      contents: `import { run } from "./scenarios/${scenario}.js";
        run().then(
          (results) => { window.__results = results; window.__done = true; },
          (error) => { window.__results = { error: String(error && error.stack || error) }; window.__done = true; },
        );`,
      resolveDir: benchDir,
      loader: "js",
    },
    bundle: true,
    format: "iife",
    minify: true,
    outfile: join(outDir, `${scenario}.js`),
    alias: {
      ...Object.fromEntries(
        packages.map((p) => [`@inkset/${p}`, `${root}/packages/${p}/dist/index.js`]),
      ),
      // React's production build skips <Profiler> timings; the profiling
      // build keeps them at production speed otherwise.
      "react-dom/client": "react-dom/profiling",
    },
    nodePaths: ["core", "react", "code"]
      .map((p) => `${root}/packages/${p}/node_modules`)
      .concat(`${root}/node_modules`),
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "warning",
  });
  const page = join(outDir, `${scenario}.html`);
  writeFileSync(
    page,
    `<!doctype html><meta charset="utf-8"><body style="margin:0"><script src="./${scenario}.js"></script>`,
  );
  return page;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const runInChrome = async (page) => {
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), "inkset-bench-chrome-"));
  const chrome = spawn(
    findChrome(),
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--disable-extensions",
      "--window-size=1280,2000",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  try {
    let targets;
    for (let i = 0; i < 50 && !targets; i++) {
      try {
        targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      } catch {
        await sleep(200);
      }
    }
    const socket = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((r) => (socket.onopen = r));
    let nextId = 0;
    const pending = new Map();
    socket.onmessage = (message) => {
      const data = JSON.parse(message.data);
      pending.get(data.id)?.(data);
      pending.delete(data.id);
    };
    const send = (method, params = {}) =>
      new Promise((r) => {
        const id = ++nextId;
        pending.set(id, r);
        socket.send(JSON.stringify({ id, method, params }));
      });

    await send("Page.navigate", { url: `file://${page}` });
    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      await sleep(500);
      const reply = await send("Runtime.evaluate", {
        expression: "window.__done ? JSON.stringify(window.__results) : null",
        returnByValue: true,
      });
      const value = reply.result?.result?.value;
      if (value) {
        socket.close();
        return JSON.parse(value);
      }
    }
    throw new Error(`Timed out waiting for ${page}`);
  } finally {
    // Chrome can ignore SIGTERM (seen right after an auto-update); give it a
    // moment to shut down, then force it, so a finished run never hangs here.
    const exited = new Promise((r) => chrome.once("exit", r));
    chrome.kill("SIGTERM");
    await Promise.race([exited, sleep(3000)]);
    if (chrome.exitCode === null && chrome.signalCode === null) {
      chrome.kill("SIGKILL");
      await Promise.race([exited, sleep(3000)]);
    }
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // A temp profile left behind is harmless; don't fail the run over it.
    }
  }
};

const outDir = mkdtempSync(join(tmpdir(), "inkset-bench-"));
const results = { root, chrome: findChrome(), date: new Date().toISOString() };
for (const scenario of scenarios) {
  results[scenario] = await runInChrome(await bundle(scenario, outDir));
}
rmSync(outDir, { recursive: true, force: true });
console.log(JSON.stringify(results, null, 2));
