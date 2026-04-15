import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@preframe/core",
    "@preframe/react",
    "@preframe/code",
    "@preframe/math",
    "@preframe/table",
  ],
};

export default nextConfig;
