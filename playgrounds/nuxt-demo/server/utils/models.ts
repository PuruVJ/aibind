import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { defineModels } from "@aibind/nuxt";

export function getModels() {
  const config = useRuntimeConfig();
  const openrouter = createOpenRouter({
    apiKey: config.openrouterApiKey,
  });

  return defineModels({
    google: openrouter("google/gemini-3.1-flash-lite-preview"),
    gpt: openrouter("openai/gpt-5-mini"),
  });
}
