import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  external: ["react", "@inkset/core", "mermaid"],
  dts: {
    compilerOptions: {
      composite: false,
      paths: {},
    },
    tsConfigPath: "./tsconfig.json",
  },
});
