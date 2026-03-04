import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ai', () => ({
	generateText: vi.fn(),
	streamText: vi.fn()
}));

import { aiAgent } from '../../src/lib/agent/ai-agent.js';
import { generateText, streamText } from 'ai';

const mockGenerateText = vi.mocked(generateText);
const mockStreamText = vi.mocked(streamText);

describe('aiAgent', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('creates an agent definition with config', () => {
		const agent = aiAgent({
			model: 'test-model',
			system: 'You are helpful.',
			maxSteps: 5
		});

		expect(agent.config.system).toBe('You are helpful.');
		expect(agent.config.maxSteps).toBe(5);
	});

	it('throws if no model configured', async () => {
		const agent = aiAgent({
			system: 'You are helpful.'
		});

		await expect(agent.run('hello')).rejects.toThrow('model is required');
	});

	it('calls generateText by default', async () => {
		mockGenerateText.mockResolvedValue({ text: 'response' } as never);

		const agent = aiAgent({
			model: 'test-model',
			system: 'Be helpful',
			maxSteps: 3
		});

		await agent.run('hello');

		expect(mockGenerateText).toHaveBeenCalledWith(
			expect.objectContaining({
				model: 'test-model',
				system: 'Be helpful',
				prompt: 'hello',
				maxSteps: 3
			})
		);
	});

	it('calls streamText when stream option is true', async () => {
		mockStreamText.mockReturnValue({ textStream: [] } as never);

		const agent = aiAgent({
			model: 'test-model',
			system: 'Be helpful'
		});

		await agent.run('hello', { stream: true });

		expect(mockStreamText).toHaveBeenCalledWith(
			expect.objectContaining({
				model: 'test-model',
				prompt: 'hello'
			})
		);
	});

	it('passes tools to AI SDK', async () => {
		mockGenerateText.mockResolvedValue({ text: 'done' } as never);

		const tools = {
			search: {
				description: 'Search the web',
				parameters: { type: 'object' as const },
				execute: vi.fn()
			}
		};

		const agent = aiAgent({
			model: 'test-model',
			system: 'Be helpful',
			tools: tools as never
		});

		await agent.run('search for svelte');

		expect(mockGenerateText).toHaveBeenCalledWith(
			expect.objectContaining({
				tools: tools
			})
		);
	});

	it('defaults maxSteps to 10', async () => {
		mockGenerateText.mockResolvedValue({ text: 'response' } as never);

		const agent = aiAgent({
			model: 'test-model',
			system: 'Be helpful'
		});

		await agent.run('hello');

		expect(mockGenerateText).toHaveBeenCalledWith(
			expect.objectContaining({
				maxSteps: 10
			})
		);
	});
});
