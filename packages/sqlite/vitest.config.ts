import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@aibind/core": resolve(__dirname, "../core/src/index.ts"),
    },
  },
});
