import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    dts: true,
    clean: true,
    outDir: "dist",
    external: [
      "react",
      "ai",
      "@aibind/react",
      "@aibind/core",
      "@standard-schema/spec",
      "zod",
      "zod/v4",
      "@valibot/to-json-schema",
    ],
  },
  {
    entry: { agent: "src/agent.ts" },
    format: ["esm"],
    dts: true,
    outDir: "dist",
    external: ["react", "ai", "@aibind/react", "@aibind/core"],
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
    external: ["react", "@aibind/react", "@aibind/markdown"],
  },
  {
    entry: { history: "src/history.ts" },
    format: ["esm"],
    dts: true,
    outDir: "dist",
    external: ["react", "@aibind/react", "@aibind/core"],
  },
  {
    entry: { project: "src/project.ts" },
    format: ["esm"],
    dts: true,
    outDir: "dist",
    external: ["react", "@aibind/react"],
  },
]);
