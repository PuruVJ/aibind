import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, type Plugin } from "vite";

/** Mark optional schema-vendor deps as external so Rollup skips them. */
function externalizeOptionalDeps(): Plugin {
  return {
    name: "externalize-optional-deps",
    resolveId(id) {
      if (id === "@valibot/to-json-schema" || id === "zod/v4") {
        return { id, external: true };
      }
    },
  };
}

export default defineConfig({
  plugins: [externalizeOptionalDeps(), sveltekit()],
  ssr: {
    // Inline workspace packages so Vite transforms them (prevents Node from
    // loading raw .ts files directly, which requires explicit .ts extensions).
    noExternal: [/^@aibind\//],
  },
});
