import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
  vite: {
    plugins: [
      {
        name: "externalize-optional-deps",
        resolveId(id: string) {
          if (id === "@valibot/to-json-schema" || id === "zod/v4") {
            return { id, external: true };
          }
        },
      },
    ],
  },
});
