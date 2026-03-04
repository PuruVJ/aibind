import { Chat } from '@ai-sdk/svelte';
import { DefaultChatTransport } from 'ai';
import { getBaseUrl } from '../internal/config.svelte.js';

interface CreateChatOptions {
	/** API endpoint for chat. Default: '{baseUrl}/chat' */
	api?: string;
	/** Chat ID for persistence */
	id?: string;
	/** HTTP headers to include in requests */
	headers?: Record<string, string>;
	/** Callback on error */
	onError?: (error: Error) => void;
}

/**
 * Factory to create a configured Chat instance with svai defaults.
 * Uses the configured base URL for the API endpoint.
 */
export function createChat(options: CreateChatOptions = {}) {
	const api = options.api ?? `${getBaseUrl()}/chat`;

	return new Chat({
		id: options.id,
		transport: new DefaultChatTransport({
			api,
			headers: options.headers
		}),
		onError: options.onError
	});
}
