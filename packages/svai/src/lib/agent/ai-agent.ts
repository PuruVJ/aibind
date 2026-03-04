import { generateText, streamText } from 'ai';
import type { AgentConfig, LanguageModel } from '../types.js';

export interface AgentDefinition {
	config: AgentConfig;
	/** Run the agent with a prompt. Returns the AI SDK result. */
	run: (
		prompt: string,
		options?: { stream?: boolean; messages?: Array<{ role: string; content: string }> }
	) => Promise<unknown>;
}

/**
 * Define a server-side agent with tools and configuration.
 * Uses AI SDK's generateText/streamText with the agent loop (maxSteps).
 */
export function aiAgent(config: AgentConfig): AgentDefinition {
	function resolveModel(): LanguageModel {
		if (!config.model) {
			throw new Error('svai/agent: model is required in agent config.');
		}
		return config.model;
	}

	async function run(
		prompt: string,
		options?: { stream?: boolean; messages?: Array<{ role: string; content: string }> }
	) {
		const model = resolveModel();
		const baseOpts = {
			model,
			system: config.system,
			tools: config.tools,
			maxSteps: config.maxSteps ?? 10
		};

		if (options?.messages) {
			// Continue from existing conversation
			const messages = [
				...options.messages.map((m) => ({
					role: m.role as 'user' | 'assistant',
					content: m.content
				})),
				{ role: 'user' as const, content: prompt }
			];

			if (options?.stream) {
				return streamText({ ...baseOpts, messages });
			}
			return generateText({ ...baseOpts, messages });
		}

		if (options?.stream) {
			return streamText({ ...baseOpts, prompt });
		}
		return generateText({ ...baseOpts, prompt });
	}

	return { config, run };
}
