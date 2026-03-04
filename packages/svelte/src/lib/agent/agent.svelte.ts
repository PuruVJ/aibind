import { onDestroy } from 'svelte';
import type { AgentStatus, AgentMessage } from '../types.js';
import { consumeTextStream } from '@aibind/common';

export interface AgentOptions {
	/** API endpoint for the agent. Required — no default. */
	endpoint: string;
	/** Custom fetch implementation. Defaults to globalThis.fetch. */
	fetch?: typeof globalThis.fetch;
	onMessage?: (message: AgentMessage) => void;
	onError?: (error: Error) => void;
}

/**
 * Client-side reactive agent state.
 * Streams responses from a server-side agent endpoint.
 * Instantiate in a component's <script> block.
 */
export class Agent {
	messages: AgentMessage[] = $state([]);
	status: AgentStatus = $state('idle');
	error: Error | null = $state(null);
	pendingApproval: { id: string; toolName: string; args: unknown } | null = $state(null);

	#controller: AbortController | null = null;
	#config: AgentOptions;

	constructor(options: AgentOptions) {
		if (!options.endpoint) {
			throw new Error('@aibind/svelte: Agent requires an `endpoint` option. If using @aibind/sveltekit, endpoints are configured automatically.');
		}
		this.#config = options;
		onDestroy(() => this.stop());
	}

	async send(prompt: string) {
		this.#controller?.abort();
		this.status = 'running';
		this.error = null;

		const userMsg: AgentMessage = {
			id: crypto.randomUUID(),
			role: 'user',
			content: prompt,
			type: 'text'
		};
		this.messages.push(userMsg);

		const controller = new AbortController();
		this.#controller = controller;

		try {
			const endpoint = this.#config.endpoint;
			const fetcher = this.#config.fetch ?? globalThis.fetch;
			const response = await fetcher(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: this.messages.map((m) => ({ role: m.role, content: m.content }))
				}),
				signal: controller.signal
			});

			if (!response.ok) throw new Error(`Agent request failed: ${response.status}`);

			const assistantMsg: AgentMessage = {
				id: crypto.randomUUID(),
				role: 'assistant',
				content: '',
				type: 'text'
			};
			this.messages.push(assistantMsg);

			for await (const chunk of consumeTextStream(response)) {
				if (controller.signal.aborted) break;
				assistantMsg.content += chunk;
			}

			this.status = 'idle';
			this.#config.onMessage?.(assistantMsg);
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') {
				this.status = 'idle';
				return;
			}

			this.error = e instanceof Error ? e : new Error(String(e));
			this.status = 'error';
			this.#config.onError?.(this.error);
		} finally {
			this.#controller = null;
		}
	}

	approve(id: string) {
		if (!this.pendingApproval || this.pendingApproval.id !== id) return;
		this.pendingApproval = null;
		this.status = 'running';
	}

	deny(id: string, _reason?: string) {
		if (!this.pendingApproval || this.pendingApproval.id !== id) return;
		this.pendingApproval = null;
		this.status = 'idle';
	}

	stop() {
		this.#controller?.abort();
		this.#controller = null;
		this.status = 'idle';
	}
}
