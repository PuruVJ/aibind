import { ServerAgent } from '@aibind/sveltekit/agent';
import { tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { models } from '../../../../models.server';

const agent = new ServerAgent({
	model: models.gpt,
	system: 'You are a helpful assistant with access to tools. Use them when the user asks about weather or time. Be concise.',
	tools: {
		get_weather: tool({
			description: 'Get current weather for a city',
			inputSchema: z.object({
				city: z.string().describe('City name, e.g. "San Francisco"'),
			}),
			execute: async ({ city }) => ({
				city,
				temperature_c: Math.round(10 + Math.random() * 25),
				condition: ['sunny', 'cloudy', 'rainy', 'partly cloudy'][
					Math.floor(Math.random() * 4)
				],
				humidity: Math.round(40 + Math.random() * 40) + '%',
			}),
		}),
		get_time: tool({
			description: 'Get the current date and time',
			inputSchema: z.object({}),
			execute: async () => ({
				time: new Date().toLocaleTimeString('en-US'),
				date: new Date().toLocaleDateString('en-US', {
					weekday: 'long',
					year: 'numeric',
					month: 'long',
					day: 'numeric',
				}),
			}),
		}),
	},
	stopWhen: stepCountIs(5),
});

export async function POST({ request }: { request: Request }) {
	const { messages } = await request.json();
	const lastMessage = messages[messages.length - 1];

	const result = agent.stream(lastMessage.content, {
		messages: messages.slice(0, -1),
	});

	return result.toTextStreamResponse();
}
