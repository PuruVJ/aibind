import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { defineModels } from "@aibind/solidstart";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export const models = defineModels({
  google: openrouter("google/gemini-3.1-flash-lite-preview"),
  gpt: openrouter("openai/gpt-5-mini"),
});
