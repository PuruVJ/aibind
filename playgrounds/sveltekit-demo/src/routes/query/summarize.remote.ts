import { googleAi } from '$lib/ai.server';
import { z } from 'zod';

export const summarize = googleAi.query(z.string(), async (text) => {
	return `Summarize the following text in 2-3 concise bullet points:\n\n${text}`;
});

export const analyze = googleAi.structuredQuery({
	input: z.string(),
	output: z.object({
		sentiment: z.enum(['positive', 'negative', 'neutral']),
		topics: z.array(z.string()),
		wordCount: z.number(),
	}),
	prompt: async (text) =>
		`Analyze the following text. Count the words, identify the main topics (max 3), and determine the overall sentiment:\n\n${text}`,
	system: 'You are a text analysis assistant. Be precise and concise.',
});
