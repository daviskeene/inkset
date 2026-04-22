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
};

export default nextConfig;
