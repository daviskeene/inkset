import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  external: ["react"],
  dts: {
    compilerOptions: {
      // Remove paths so DTS generation uses the compiled @preframe/core
      // package from node_modules instead of source files outside rootDir
      paths: {},
    },
  },
});
