import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    dts: true,
    clean: true,
    outDir: "dist",
    external: [
      "vue",
      "ai",
      "@aibind/vue",
      "@aibind/core",
      "@standard-schema/spec",
      "zod",
      "zod/v4",
      "@valibot/to-json-schema",
    ],
  },
  {
    entry: { "composables/agent": "src/composables/agent.ts" },
    format: ["esm"],
    dts: true,
    outDir: "dist",
    external: ["vue", "ai", "@aibind/vue", "@aibind/core"],
  },
  {
    entry: { "server/index": "src/server/index.ts" },
    format: ["esm"],
    dts: true,
    outDir: "dist",
    external: ["ai", "@aibind/core"],
  },
  {
    entry: { markdown: "src/markdown.ts" },
    format: ["esm"],
    dts: true,
    outDir: "dist",
    external: ["vue", "@aibind/vue", "@aibind/markdown"],
  },
  {
    entry: { history: "src/history.ts" },
    format: ["esm"],
    dts: true,
    outDir: "dist",
    external: ["vue", "@aibind/vue", "@aibind/core"],
  },
  {
    entry: { project: "src/project.ts" },
    format: ["esm"],
    dts: true,
    outDir: "dist",
    external: ["vue", "@aibind/vue"],
  },
]);
