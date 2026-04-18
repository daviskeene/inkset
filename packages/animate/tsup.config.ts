// Build configuration for @inkset/animate.
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  external: ["@inkset/core", "react"],
  dts: {
    // Empty `paths` on the DTS build so tsup resolves @inkset/core via
    // node_modules (the compiled d.ts) instead of the workspace source file,
    // which sits outside this package's rootDir. Also disable `composite`
    // here so tsup's synthesized program doesn't demand an explicit file list.
    compilerOptions: {
      composite: false,
      paths: {},
    },
  },
});
