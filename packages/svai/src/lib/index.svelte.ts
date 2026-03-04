export { createAI } from './internal/config.svelte.js';

export type {
	SvaiConfig,
	LanguageModel,
	UseStreamOptions,
	UseStreamReturn,
	UseStructuredStreamOptions,
	UseStructuredStreamReturn,
	DeepPartial
} from './types.js';

import { getBaseUrl, getModel } from './internal/config.svelte.js';
import { consumeTextStream, parsePartialJSON } from './internal/stream-utils.js';
import type {
	UseStreamOptions,
	UseStreamReturn,
	UseStructuredStreamOptions,
	UseStructuredStreamReturn,
	LanguageModel
} from './types.js';

/**
 * Reactive streaming text primitive.
 * POSTs to a streaming endpoint and accumulates tokens into reactive $state.
 */
export function useStream(options: UseStreamOptions = {}): UseStreamReturn {
	let text = $state('');
	let loading = $state(false);
	let error = $state<Error | null>(null);
	let done = $state(false);
	let abortController: AbortController | null = null;
	let lastPrompt = '';

	async function send(prompt: string) {
		lastPrompt = prompt;
		text = '';
		loading = true;
		error = null;
		done = false;

		const controller = new AbortController();
		abortController = controller;

		try {
			const endpoint = options.endpoint ?? `${getBaseUrl()}/stream`;
			const model = getModel(options.model);

			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					prompt,
					model: typeof model === 'string' ? model : undefined,
					system: options.system
				}),
				signal: controller.signal
			});

			if (!response.ok) {
				throw new Error(`Stream request failed: ${response.status}`);
			}

			for await (const chunk of consumeTextStream(response)) {
				if (controller.signal.aborted) break;
				text += chunk;
			}

			done = true;
			options.onFinish?.(text);
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') {
				done = true;
			} else {
				error = e instanceof Error ? e : new Error(String(e));
				options.onError?.(error);
			}
		} finally {
			loading = false;
			abortController = null;
		}
	}

	function abort() {
		abortController?.abort();
	}

	function retry() {
		if (lastPrompt) send(lastPrompt);
	}

	return {
		get text() {
			return text;
		},
		get loading() {
			return loading;
		},
		get error() {
			return error;
		},
		get done() {
			return done;
		},
		send,
		abort,
		retry
	};
}

/**
 * Reactive structured streaming primitive.
 * Streams JSON from server and parses partial objects as they arrive.
 */
export function useStructuredStream<T>(
	options: UseStructuredStreamOptions<T>
): UseStructuredStreamReturn<T> {
	let data = $state<T | null>(null);
	let partial = $state<Partial<T> | null>(null);
	let raw = $state('');
	let loading = $state(false);
	let error = $state<Error | null>(null);
	let done = $state(false);
	let abortController: AbortController | null = null;
	let lastPrompt = '';

	async function send(prompt: string) {
		lastPrompt = prompt;
		data = null;
		partial = null;
		raw = '';
		loading = true;
		error = null;
		done = false;

		const controller = new AbortController();
		abortController = controller;

		try {
			const endpoint = options.endpoint ?? `${getBaseUrl()}/structured`;
			const model = getModel(options.model);

			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					prompt,
					model: typeof model === 'string' ? model : undefined,
					system: options.system
				}),
				signal: controller.signal
			});

			if (!response.ok) {
				throw new Error(`Structured stream failed: ${response.status}`);
			}

			for await (const chunk of consumeTextStream(response)) {
				if (controller.signal.aborted) break;
				raw += chunk;
				const parsed = parsePartialJSON<T>(raw);
				if (parsed) partial = parsed;
			}

			// Final parse + validate with Zod schema
			const finalParsed = JSON.parse(raw);
			data = options.schema.parse(finalParsed) as T;
			done = true;
			options.onFinish?.(data!);
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') {
				done = true;
			} else {
				error = e instanceof Error ? e : new Error(String(e));
				options.onError?.(error);
			}
		} finally {
			loading = false;
			abortController = null;
		}
	}

	function abort() {
		abortController?.abort();
	}

	function retry() {
		if (lastPrompt) send(lastPrompt);
	}

	return {
		get data() {
			return data;
		},
		get partial() {
			return partial;
		},
		get raw() {
			return raw;
		},
		get loading() {
			return loading;
		},
		get error() {
			return error;
		},
		get done() {
			return done;
		},
		send,
		abort,
		retry
	};
}
