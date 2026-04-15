import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: {
    compilerOptions: {
      composite: false,
      rootDir: "./src",
    },
    // Ensure all source files are included in the DTS build
    tsConfigPath: "./tsconfig.json",
  },
});
