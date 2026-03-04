import { ref, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import type { AgentStatus, AgentMessage, AgentOptions } from '../types.js';
import { consumeTextStream } from '@aibind/common';

export type { AgentOptions } from '../types.js';

export interface UseAgentReturn {
	messages: Ref<AgentMessage[]>;
	status: Ref<AgentStatus>;
	error: Ref<Error | null>;
	pendingApproval: Ref<{ id: string; toolName: string; args: unknown } | null>;
	send: (prompt: string) => Promise<void>;
	stop: () => void;
	approve: (id: string) => void;
	deny: (id: string, reason?: string) => void;
}

/**
 * Reactive agent composable.
 * Streams responses from a server-side agent endpoint.
 * Call inside a component's `setup()`.
 */
export function useAgent(options: AgentOptions): UseAgentReturn {
	if (!options.endpoint) {
		throw new Error('@aibind/vue: useAgent requires an `endpoint` option. If using @aibind/nuxt, endpoints are configured automatically.');
	}
	const messages: Ref<AgentMessage[]> = ref([]);
	const status: Ref<AgentStatus> = ref('idle');
	const error: Ref<Error | null> = ref(null);
	const pendingApproval: Ref<{ id: string; toolName: string; args: unknown } | null> = ref(null);

	let controller: AbortController | null = null;

	async function send(prompt: string) {
		controller?.abort();
		status.value = 'running';
		error.value = null;

		const userMsg: AgentMessage = {
			id: crypto.randomUUID(),
			role: 'user',
			content: prompt,
			type: 'text',
		};
		messages.value = [...messages.value, userMsg];

		const ctrl = new AbortController();
		controller = ctrl;

		try {
			const endpoint = options.endpoint;
			const fetcher = options.fetch ?? globalThis.fetch;
			const response = await fetcher(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: messages.value.map((m) => ({ role: m.role, content: m.content })),
				}),
				signal: ctrl.signal,
			});

			if (!response.ok) throw new Error(`Agent request failed: ${response.status}`);

			const assistantMsg: AgentMessage = {
				id: crypto.randomUUID(),
				role: 'assistant',
				content: '',
				type: 'text',
			};
			messages.value = [...messages.value, assistantMsg];

			for await (const chunk of consumeTextStream(response)) {
				if (ctrl.signal.aborted) break;
				assistantMsg.content += chunk;
				// Trigger Vue reactivity by replacing the array
				messages.value = [...messages.value.slice(0, -1), { ...assistantMsg }];
			}

			status.value = 'idle';
			options.onMessage?.(assistantMsg);
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') {
				status.value = 'idle';
				return;
			}

			error.value = e instanceof Error ? e : new Error(String(e));
			status.value = 'error';
			options.onError?.(error.value);
		} finally {
			controller = null;
		}
	}

	function approve(id: string) {
		if (!pendingApproval.value || pendingApproval.value.id !== id) return;
		pendingApproval.value = null;
		status.value = 'running';
	}

	function deny(id: string, _reason?: string) {
		if (!pendingApproval.value || pendingApproval.value.id !== id) return;
		pendingApproval.value = null;
		status.value = 'idle';
	}

	function stop() {
		controller?.abort();
		controller = null;
		status.value = 'idle';
	}

	onUnmounted(() => stop());

	return { messages, status, error, pendingApproval, send, stop, approve, deny };
}
