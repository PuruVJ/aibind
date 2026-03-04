import { streamText, Output, jsonSchema } from 'ai';
import type { LanguageModel } from '../types.js';

interface StreamHandlerConfig {
	/** Single model for all requests. */
	model?: LanguageModel;
	/** Named models — client selects via `model` key in request body. */
	models?: Record<string, LanguageModel>;
	/** Route prefix for the streaming endpoints. Default: '/api/svai' */
	prefix?: string;
}

/**
 * SvelteKit handle hook for streaming endpoints.
 * Supports single model or named multi-model configuration.
 *
 * @example
 * ```ts
 * // Single model
 * import { createStreamHandler } from 'svai/server';
 * export const handle = createStreamHandler({
 *   model: anthropic('claude-sonnet-4')
 * });
 *
 * // Multi-model with defineModels
 * import { models } from '$lib/models';
 * export const handle = createStreamHandler({ models });
 * ```
 */
export function createStreamHandler(config: StreamHandlerConfig) {
	const prefix = config.prefix ?? '/api/svai';

	function resolveModel(requested?: string): import('ai').LanguageModel {
		if (config.models) {
			const key = requested ?? Object.keys(config.models)[0];
			const model = config.models[key];
			if (!model) {
				throw new Error(`Unknown model key: "${key}"`);
			}
			return model as import('ai').LanguageModel;
		}
		if (!config.model) {
			throw new Error('No model configured — provide `model` or `models`');
		}
		return config.model as import('ai').LanguageModel;
	}

	function handleStream(body: Record<string, unknown>, structured: boolean) {
		const { prompt, system, model: requestedModel, schema } = body;
		if (typeof prompt !== 'string' || !prompt.trim()) {
			return Response.json({ error: 'prompt is required' }, { status: 400 });
		}

		let model: import('ai').LanguageModel;
		try {
			model = resolveModel(requestedModel as string | undefined);
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			return Response.json({ error: message }, { status: 400 });
		}

		const output = structured
			? schema
				? Output.object({ schema: jsonSchema(schema as never) })
				: Output.json()
			: undefined;

		const result = streamText({
			model,
			prompt,
			system: system as string | undefined,
			...(output && { output })
		});
		return result.toTextStreamResponse();
	}

	return async function handle({
		event,
		resolve
	}: {
		event: { request: Request; url: URL };
		resolve: (event: unknown) => Promise<Response>;
	}) {
		const pathname = event.url.pathname;

		if (event.request.method === 'POST') {
			if (pathname === `${prefix}/stream`) {
				return handleStream(await event.request.json(), false);
			}
			if (pathname === `${prefix}/structured`) {
				return handleStream(await event.request.json(), true);
			}
		}

		return resolve(event);
	};
}
