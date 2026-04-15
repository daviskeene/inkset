// Build configuration for @preframe/react.
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  external: ["react"],
  dts: {
    compilerOptions: {
      // DTS generation must use compiled @preframe/core from node_modules, not source files
      paths: {},
    },
  },
});
