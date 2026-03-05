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
      "@standard-schema/spec",
      "zod",
      "zod/v4",
      "@valibot/to-json-schema",
    ],
  },
  {
    entry: { "agent/index": "src/agent/index.ts" },
    format: ["esm"],
    dts: true,
    outDir: "dist",
    external: ["react", "ai"],
  },
  {
    entry: { "markdown/index": "src/markdown/index.ts" },
    format: ["esm"],
    dts: true,
    outDir: "dist",
    external: ["react"],
  },
  {
    entry: { "history/index": "src/history/index.ts" },
    format: ["esm"],
    dts: true,
    outDir: "dist",
    external: ["react"],
  },
  {
    entry: { "project/index": "src/project/index.ts" },
    format: ["esm"],
    dts: true,
    outDir: "dist",
    external: ["react"],
  },
]);
