import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  dts: true,
  clean: true,
  outDir: "dist",
  external: ["@valibot/to-json-schema", "zod/v4"],
});
