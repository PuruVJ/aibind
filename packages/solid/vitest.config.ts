import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "solid-js/web": path.resolve(
        __dirname,
        "node_modules/solid-js/web/dist/web.js",
      ),
      "solid-js": path.resolve(
        __dirname,
        "node_modules/solid-js/dist/solid.js",
      ),
    },
  },
});
