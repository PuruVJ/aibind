import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  dts: true,
  clean: true,
  outDir: "dist",
  external: ["@aibind/core", "better-sqlite3"],
});
