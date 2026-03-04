import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock $app/server — must be hoisted before imports
vi.mock('$app/server', () => ({
	query: vi.fn((_schema: unknown, fn: unknown) => fn),
	command: vi.fn((_schema: unknown, fn: unknown) => fn),
	getRequestEvent: vi.fn(() => ({
		request: new Request('http://localhost'),
		cookies: {},
		locals: {},
		url: new URL('http://localhost'),
		route: { id: '/test' }
	}))
}));

// Mock AI SDK
vi.mock('ai', () => ({
	generateText: vi.fn(),
	Output: {
		object: vi.fn((opts: { schema: unknown }) => ({ type: 'object', schema: opts.schema }))
	}
}));

import { AIRemote } from '../../src/lib/remote/index.js';
import { generateText } from 'ai';
import * as v from 'valibot';

const mockGenerateText = vi.mocked(generateText);

describe('AIRemote.query', () => {
	let ai: AIRemote;

	beforeEach(() => {
		vi.clearAllMocks();
		ai = new AIRemote('test-model');
	});

	it('simple text query calls generateText with prompt', async () => {
		mockGenerateText.mockResolvedValue({ text: 'AI response' } as never);

		const handler = ai.query(v.string(), async (input) => `Explain: ${input}`);
		const result = await (handler as unknown as (input: string) => Promise<string>)('quantum');

		expect(mockGenerateText).toHaveBeenCalledWith({
			model: 'test-model',
			prompt: 'Explain: quantum'
		});
		expect(result).toBe('AI response');
	});
});

describe('AIRemote.structuredQuery', () => {
	let ai: AIRemote;

	beforeEach(() => {
		vi.clearAllMocks();
		ai = new AIRemote('test-model');
	});

	it('calls generateText with Output.object', async () => {
		const outputSchema = v.object({ sentiment: v.string(), score: v.number() });
		mockGenerateText.mockResolvedValue({
			output: { sentiment: 'positive', score: 0.9 }
		} as never);

		const handler = ai.structuredQuery({
			input: v.string(),
			output: outputSchema,
			prompt: async (text) => `Analyze: ${text}`,
			system: 'Be precise'
		});

		const result = await (handler as unknown as (input: string) => Promise<unknown>)('great product');

		expect(mockGenerateText).toHaveBeenCalledWith({
			model: 'test-model',
			prompt: 'Analyze: great product',
			system: 'Be precise',
			output: expect.objectContaining({ type: 'object' })
		});
		expect(result).toEqual({ sentiment: 'positive', score: 0.9 });
	});
});

describe('AIRemote.command', () => {
	let ai: AIRemote;

	beforeEach(() => {
		vi.clearAllMocks();
		ai = new AIRemote('test-model');
	});

	it('injects model and event into handler', async () => {
		const handler = vi.fn().mockResolvedValue({ id: '123' });

		const innerFn = ai.command(v.object({ topic: v.string() }), handler);
		await (innerFn as unknown as (input: { topic: string }) => Promise<unknown>)({
			topic: 'test'
		});

		expect(handler).toHaveBeenCalledWith(
			{ topic: 'test' },
			expect.objectContaining({
				model: 'test-model',
				event: expect.objectContaining({ request: expect.any(Request) })
			})
		);
	});

	it('propagates handler errors', async () => {
		const handler = vi.fn().mockRejectedValue(new Error('handler failed'));
		const innerFn = ai.command(v.object({ topic: v.string() }), handler);

		await expect(
			(innerFn as unknown as (input: { topic: string }) => Promise<unknown>)({ topic: 'test' })
		).rejects.toThrow('handler failed');
	});
});

describe('AIRemote error propagation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('propagates generateText errors from query', async () => {
		mockGenerateText.mockRejectedValue(new Error('AI service down'));
		const ai = new AIRemote('test-model');
		const handler = ai.query(v.string(), async (input) => `Explain: ${input}`);

		await expect(
			(handler as unknown as (input: string) => Promise<string>)('test')
		).rejects.toThrow('AI service down');
	});

	it('propagates promptFn errors from query', async () => {
		const ai = new AIRemote('test-model');
		const handler = ai.query(v.string(), async () => {
			throw new Error('prompt generation failed');
		});

		await expect(
			(handler as unknown as (input: string) => Promise<string>)('test')
		).rejects.toThrow('prompt generation failed');
	});

	it('uses different model per instance', async () => {
		mockGenerateText.mockResolvedValue({ text: 'result' } as never);

		const ai1 = new AIRemote('model-a');
		const ai2 = new AIRemote('model-b');

		const h1 = ai1.query(v.string(), async (input) => input);
		const h2 = ai2.query(v.string(), async (input) => input);

		await (h1 as unknown as (input: string) => Promise<string>)('test');
		await (h2 as unknown as (input: string) => Promise<string>)('test');

		expect(mockGenerateText).toHaveBeenNthCalledWith(1, expect.objectContaining({ model: 'model-a' }));
		expect(mockGenerateText).toHaveBeenNthCalledWith(2, expect.objectContaining({ model: 'model-b' }));
	});
});
