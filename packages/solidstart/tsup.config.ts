import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    outDir: "dist",
    external: [
      "solid-js",
      "ai",
      "@standard-schema/spec",
      "zod",
      "zod/v4",
      "@valibot/to-json-schema",
    ],
  },
  {
    entry: { agent: "src/agent.ts" },
    format: ["esm", "cjs"],
    dts: true,
    outDir: "dist",
    external: ["solid-js", "ai"],
  },
  {
    entry: { "server/index": "src/server/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    outDir: "dist",
    external: ["ai"],
  },
  {
    entry: { markdown: "src/markdown.ts" },
    format: ["esm", "cjs"],
    dts: true,
    outDir: "dist",
    external: ["solid-js"],
  },
]);
