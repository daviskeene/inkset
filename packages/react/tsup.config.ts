// Build configuration for @inkset/react.
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  external: ["react", "@inkset/core", "@inkset/animate"],
  dts: {
    compilerOptions: {
      // DTS generation must use compiled @inkset/core from node_modules, not source files
      paths: {},
    },
  },
});
