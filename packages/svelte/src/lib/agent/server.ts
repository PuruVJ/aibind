import { generateText, streamText, stepCountIs } from 'ai';
import type { AgentConfig } from '../types.js';

export interface RunOptions {
	messages?: Array<{ role: string; content: string }>;
}

/**
 * Server-side agent with tools and a system prompt.
 * Uses AI SDK's generateText/streamText with stopWhen for multi-step tool loops.
 */
export class ServerAgent {
	#config: Required<Pick<AgentConfig, 'model' | 'system'>> & Pick<AgentConfig, 'tools' | 'stopWhen'>;

	constructor(config: AgentConfig) {
		if (!config.model) {
			throw new Error('svai/agent: model is required in agent config.');
		}
		this.#config = {
			model: config.model,
			system: config.system,
			tools: config.tools,
			stopWhen: config.stopWhen ?? stepCountIs(10)
		};
	}

	#baseOpts() {
		return {
			model: this.#config.model as import('ai').LanguageModel,
			system: this.#config.system,
			tools: this.#config.tools,
			stopWhen: this.#config.stopWhen
		};
	}

	#buildMessages(prompt: string, previous?: RunOptions['messages']) {
		if (previous?.length) {
			return [
				...previous.map((m) => ({
					role: m.role as 'user' | 'assistant',
					content: m.content
				})),
				{ role: 'user' as const, content: prompt }
			];
		}
		return undefined;
	}

	/** Stream a response. Returns StreamTextResult synchronously — no await needed. */
	stream(prompt: string, options?: RunOptions) {
		const messages = this.#buildMessages(prompt, options?.messages);
		return streamText({
			...this.#baseOpts(),
			...(messages ? { messages } : { prompt })
		});
	}

	/** Generate a complete response (non-streaming). */
	async run(prompt: string, options?: RunOptions) {
		const messages = this.#buildMessages(prompt, options?.messages);
		return generateText({
			...this.#baseOpts(),
			...(messages ? { messages } : { prompt })
		});
	}
}
