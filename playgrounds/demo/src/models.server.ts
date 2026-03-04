import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { defineModels } from '@aibind/svelte';
import { OPENROUTER_API_KEY } from '$env/static/private';

if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is required');

const openrouter = createOpenRouter({
	apiKey: OPENROUTER_API_KEY,
});

export const models = defineModels({
	google: openrouter('google/gemini-3.1-flash-lite-preview'),
	gpt: openrouter('openai/gpt-5-mini'),
});

export type Models = typeof models.$infer;
