import { streamText, Output, jsonSchema } from 'ai';

type LanguageModel = string | import('ai').LanguageModel;

interface StreamHandlerConfig {
	/** Single model for all requests. */
	model?: LanguageModel;
	/** Named models — client selects via `model` key in request body. */
	models?: Record<string, LanguageModel>;
	/** Route prefix for the streaming endpoints. Default: '/api/__aibind__' */
	prefix?: string;
}

/**
 * H3/Nitro event handler for streaming endpoints.
 * Works with Nuxt server routes and any H3-based server.
 *
 * @example
 * ```ts
 * // server/api/__aibind__/[...path].ts
 * import { createStreamHandler } from '@aibind/nuxt/server';
 * import { models } from '~/models';
 * export default createStreamHandler({ models });
 * ```
 */
export function createStreamHandler(config: StreamHandlerConfig) {
	const prefix = config.prefix ?? '/api/__aibind__';

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

	/**
	 * Generic handler that works with any framework using Web Request/Response.
	 * For Nuxt, use as a catch-all server route.
	 */
	return async function handle(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const pathname = url.pathname;

		if (request.method === 'POST') {
			if (pathname === `${prefix}/stream`) {
				return handleStream(await request.json(), false);
			}
			if (pathname === `${prefix}/structured`) {
				return handleStream(await request.json(), true);
			}
		}

		return new Response('Not Found', { status: 404 });
	};
}
