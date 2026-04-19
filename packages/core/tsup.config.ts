// Build configuration for @inkset/core.
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: {
    compilerOptions: {
      composite: false,
      rootDir: "./src",
    },
    tsConfigPath: "./tsconfig.json",
  },
});
