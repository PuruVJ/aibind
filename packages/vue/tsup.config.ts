import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "agent/index": "src/agent/index.ts",
    "markdown/index": "src/markdown/index.ts",
    "history/index": "src/history/index.ts",
    "project/index": "src/project/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  outDir: "dist",
  external: [
    "vue",
    "ai",
    "@standard-schema/spec",
    "zod",
    "zod/v4",
    "@valibot/to-json-schema",
  ],
});
