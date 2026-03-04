import type { AgentState, AgentStatus, AgentMessage } from '../types.js';
import { getBaseUrl } from '../internal/config.svelte.js';
import { consumeTextStream } from '../internal/stream-utils.js';

interface UseAgentOptions {
	/** API endpoint for the agent. Default: '{baseUrl}/agent' */
	endpoint?: string;
	onMessage?: (message: AgentMessage) => void;
	onError?: (error: Error) => void;
}

let nextId = 0;
function genId(): string {
	return `msg_${++nextId}_${Date.now()}`;
}

/**
 * Client-side reactive agent state.
 * Streams responses from a server-side agent endpoint.
 */
export function useAgent(options: UseAgentOptions = {}): AgentState {
	let messages = $state<AgentMessage[]>([]);
	let status = $state<AgentStatus>('idle');
	let error = $state<Error | null>(null);
	let pendingApproval = $state<{ id: string; toolName: string; args: unknown } | null>(null);
	let abortController: AbortController | null = null;

	async function send(prompt: string) {
		status = 'running';
		error = null;

		const userMsg: AgentMessage = {
			id: genId(),
			role: 'user',
			content: prompt,
			type: 'text'
		};
		messages = [...messages, userMsg];

		const controller = new AbortController();
		abortController = controller;

		try {
			const endpoint = options.endpoint ?? `${getBaseUrl()}/agent`;
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: messages.map((m) => ({ role: m.role, content: m.content }))
				}),
				signal: controller.signal
			});

			if (!response.ok) {
				throw new Error(`Agent request failed: ${response.status}`);
			}

			let assistantText = '';
			for await (const chunk of consumeTextStream(response)) {
				if (controller.signal.aborted) break;
				assistantText += chunk;
			}

			const assistantMsg: AgentMessage = {
				id: genId(),
				role: 'assistant',
				content: assistantText,
				type: 'text'
			};
			messages = [...messages, assistantMsg];
			status = 'idle';
			options.onMessage?.(assistantMsg);
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') {
				status = 'idle';
			} else {
				error = e instanceof Error ? e : new Error(String(e));
				status = 'error';
				options.onError?.(error);
			}
		} finally {
			abortController = null;
		}
	}

	function approve(id: string) {
		if (!pendingApproval || pendingApproval.id !== id) return;
		pendingApproval = null;
		status = 'running';
		// In a full implementation, this would send the approval to the server
	}

	function deny(id: string, _reason?: string) {
		if (!pendingApproval || pendingApproval.id !== id) return;
		pendingApproval = null;
		status = 'idle';
	}

	function stop() {
		abortController?.abort();
		abortController = null;
		status = 'idle';
	}

	return {
		get messages() {
			return messages;
		},
		get status() {
			return status;
		},
		get error() {
			return error;
		},
		get pendingApproval() {
			return pendingApproval;
		},
		send,
		approve,
		deny,
		stop
	};
}
