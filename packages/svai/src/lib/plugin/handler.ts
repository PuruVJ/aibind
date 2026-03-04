import { streamText, Output } from 'ai';
import type { LanguageModel } from '../types.js';

interface StreamHandlerConfig {
	model: LanguageModel;
	/** Route prefix for the streaming endpoints. Default: '/api/svai' */
	prefix?: string;
}

/**
 * SvelteKit handle hook for streaming endpoints.
 * Alternative to the Vite plugin route generation — use this in hooks.server.ts
 * for more control over the streaming endpoints.
 *
 * @example
 * ```ts
 * // src/hooks.server.ts
 * import { createStreamHandler } from 'svai/plugin';
 * import { anthropic } from '@ai-sdk/anthropic';
 *
 * export const handle = createStreamHandler({
 *   model: anthropic('claude-sonnet-4')
 * });
 * ```
 */
export function createStreamHandler(config: StreamHandlerConfig) {
	const prefix = config.prefix ?? '/api/svai';

	return async function handle({
		event,
		resolve
	}: {
		event: { request: Request; url: URL };
		resolve: (event: unknown) => Promise<Response>;
	}) {
		const pathname = event.url.pathname;

		if (pathname === `${prefix}/stream` && event.request.method === 'POST') {
			const { prompt, system } = await event.request.json();
			const result = streamText({
				model: config.model,
				prompt,
				system
			});
			return result.toTextStreamResponse();
		}

		if (pathname === `${prefix}/structured` && event.request.method === 'POST') {
			const { prompt, system } = await event.request.json();
			const result = streamText({
				model: config.model,
				prompt,
				system,
				output: Output.json()
			});
			return result.toTextStreamResponse();
		}

		return resolve(event);
	};
}
