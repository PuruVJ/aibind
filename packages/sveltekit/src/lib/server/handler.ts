import type { StreamStore } from '@aibind/core';
import { MemoryStreamStore, createDurableStream, createResumeResponse } from '@aibind/core';
import type { LanguageModel } from '@aibind/svelte';
import { Output, jsonSchema, streamText } from 'ai';

interface StreamHandlerConfig {
	/** Single model for all requests. */
	model?: LanguageModel;
	/** Named models — client selects via `model` key in request body. */
	models?: Record<string, LanguageModel>;
	/** Route prefix for the streaming endpoints. Default: '/__aibind__' */
	prefix?: string;
	/**
	 * Enable resumable streams. When true, streams are buffered server-side
	 * and clients can reconnect + resume from where they left off.
	 * Also adds stop + resume endpoints.
	 */
	resumable?: boolean;
	/**
	 * Custom StreamStore for resumable streams. Defaults to MemoryStreamStore.
	 * Only used when `resumable: true`.
	 */
	store?: StreamStore;
}

// Map of active stream controllers (for stop endpoint)
const activeStreams = new Map<string, AbortController>();

/**
 * SvelteKit handle hook for streaming endpoints.
 * Supports single model or named multi-model configuration.
 *
 * @example
 * ```ts
 * // src/hooks.server.ts
 * import { createStreamHandler } from '@aibind/sveltekit/server';
 * import { models } from '$lib/models';
 * export const handle = createStreamHandler({ models });
 * ```
 */
export function createStreamHandler(config: StreamHandlerConfig) {
	const prefix = config.prefix ?? '/__aibind__';
	const resumable = config.resumable ?? false;
	const store = resumable ? (config.store ?? new MemoryStreamStore()) : null;

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
			...(output && { output }),
		});

		// Non-resumable: return plain text stream (original behavior)
		if (!resumable || !store) {
			return result.toTextStreamResponse();
		}

		// Resumable: pipe through durable stream
		return handleDurableStream(result.textStream);
	}

	async function handleDurableStream(source: AsyncIterable<string>): Promise<Response> {
		const { streamId, response, controller } = await createDurableStream({
			store: store!,
			source,
		});
		activeStreams.set(streamId, controller);

		// Clean up controller reference when stream ends
		(async () => {
			try {
				// Wait for the response body to be fully consumed
				// The controller will be aborted if stop() is called
				await response.body?.pipeTo(new WritableStream());
			} catch {
				// Stream may be cancelled by client
			} finally {
				activeStreams.delete(streamId);
			}
		})();

		return response;
	}

	function handleResume(url: URL): Response {
		if (!store) {
			return Response.json({ error: 'Resumable streams not enabled' }, { status: 400 });
		}

		const streamId = url.searchParams.get('id');
		const afterSeq = parseInt(url.searchParams.get('after') ?? '0', 10);

		if (!streamId) {
			return Response.json({ error: 'id parameter is required' }, { status: 400 });
		}

		return createResumeResponse({ store, streamId, afterSeq });
	}

	async function handleStop(body: Record<string, unknown>): Promise<Response> {
		const { id } = body;
		if (typeof id !== 'string') {
			return Response.json({ error: 'id is required' }, { status: 400 });
		}

		// Abort the generation
		const controller = activeStreams.get(id);
		if (controller) {
			controller.abort();
			activeStreams.delete(id);
		}

		// Also mark in store
		if (store) {
			try {
				await store.stop(id);
			} catch {
				// Stream may already be stopped/completed
			}
		}

		return Response.json({ ok: true });
	}

	return async function handle({
		event,
		resolve,
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
			if (resumable && pathname === `${prefix}/stream/stop`) {
				return handleStop(await event.request.json());
			}
		}

		if (event.request.method === 'GET') {
			if (resumable && pathname === `${prefix}/stream/resume`) {
				return handleResume(event.url);
			}
		}

		return resolve(event);
	};
}
