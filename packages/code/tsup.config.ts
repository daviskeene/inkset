import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  external: ["react", "@inkset/core", "shiki"],
  dts: {
    compilerOptions: {
      composite: false,
      paths: {},
    },
    tsConfigPath: "./tsconfig.json",
  },
});
