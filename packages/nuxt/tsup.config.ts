import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "composables/agent": "src/composables/agent.ts",
    "server/index": "src/server/index.ts",
    markdown: "src/markdown.ts",
    history: "src/history.ts",
    project: "src/project.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  outDir: "dist",
  external: [
    "vue",
    "ai",
    "@aibind/vue",
    "@aibind/core",
    "@aibind/markdown",
    "@standard-schema/spec",
    "zod",
    "zod/v4",
    "@valibot/to-json-schema",
  ],
});
