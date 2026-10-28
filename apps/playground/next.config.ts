import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship the profiling-enabled React production bundle so the /compare page's
  // <Profiler onRender> callbacks actually fire (they're stripped in the
  // default production build for perf).
  reactProductionProfiling: true,
  transpilePackages: [
    "@inkset/core",
    "@inkset/react",
    "@inkset/animate",
    "@inkset/code",
    "@inkset/math",
    "@inkset/table",
    "@inkset/diagram",
  ],
  // Docs pages render their body in the browser, so agents get the Markdown
  // source instead: at /docs/<slug>.md, or at /docs/<slug> when they ask for
  // it with `Accept: text/markdown`. beforeFiles runs ahead of the prerendered
  // HTML pages.
  rewrites: async () => ({
    beforeFiles: [
      { source: "/docs/:slug([a-z0-9-]+)\\.md", destination: "/docs/md/:slug" },
      {
        source: "/docs/:slug([a-z0-9-]+)",
        has: [{ type: "header", key: "accept", value: "(.*)text/markdown(.*)" }],
        destination: "/docs/md/:slug",
      },
    ],
    afterFiles: [],
    fallback: [],
  }),
  // Prerendered responses drop a Vary set in the route handler, and a cache
  // that keys only on the URL could otherwise serve Markdown to a browser.
  headers: async () => [{ source: "/docs/:path*", headers: [{ key: "Vary", value: "Accept" }] }],
};

export default nextConfig;
