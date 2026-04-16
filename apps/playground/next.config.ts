import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@inkset/core",
    "@inkset/react",
    "@inkset/code",
    "@inkset/math",
    "@inkset/table",
  ],
};

export default nextConfig;
