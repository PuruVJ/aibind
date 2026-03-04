import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock $app/server — must be hoisted before imports
vi.mock('$app/server', () => ({
	query: vi.fn((_schema: unknown, fn: unknown) => fn),
	command: vi.fn((_schema: unknown, fn: unknown) => fn),
	form: vi.fn((_schema: unknown, fn: unknown) => fn),
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

import { configureServer, getServerModel, aiQuery, aiCommand, aiForm } from '../../src/lib/server/index.js';
import { generateText } from 'ai';
import { z } from 'zod';

const mockGenerateText = vi.mocked(generateText);

describe('configureServer / getServerModel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('configures and retrieves server model', () => {
		configureServer({ model: 'anthropic/claude-sonnet-4' });
		expect(getServerModel()).toBe('anthropic/claude-sonnet-4');
	});

	it('returns override when provided', () => {
		configureServer({ model: 'anthropic/claude-sonnet-4' });
		expect(getServerModel('openai/gpt-4')).toBe('openai/gpt-4');
	});
});

describe('aiQuery', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		configureServer({ model: 'test-model' });
	});

	it('simple text query calls generateText with prompt', async () => {
		mockGenerateText.mockResolvedValue({ text: 'AI response' } as never);

		// aiQuery returns the inner handler directly (because our mock query() does)
		const handler = aiQuery(z.string(), async (input) => `Explain: ${input}`);
		const result = await (handler as unknown as (input: string) => Promise<string>)('quantum');

		expect(mockGenerateText).toHaveBeenCalledWith({
			model: 'test-model',
			prompt: 'Explain: quantum'
		});
		expect(result).toBe('AI response');
	});

	it('structured query calls generateText with Output.object', async () => {
		const outputSchema = z.object({ sentiment: z.string(), score: z.number() });
		mockGenerateText.mockResolvedValue({
			output: { sentiment: 'positive', score: 0.9 }
		} as never);

		const handler = aiQuery({
			input: z.string(),
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

describe('aiCommand', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		configureServer({ model: 'test-model' });
	});

	it('injects model and event into handler', async () => {
		const handler = vi.fn().mockResolvedValue({ id: '123' });

		// aiCommand wraps command(), which our mock returns the inner fn
		const innerFn = aiCommand(z.object({ topic: z.string() }), handler);
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
});

describe('aiForm', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		configureServer({ model: 'test-model' });
	});

	it('injects model, event, and issue into handler', async () => {
		const handler = vi.fn().mockResolvedValue({ rewritten: 'new text' });

		// aiForm wraps form(), which our mock returns the inner fn
		const innerFn = aiForm(z.object({ text: z.string() }), handler);
		await (innerFn as unknown as (data: { text: string }, issue: unknown) => Promise<unknown>)(
			{ text: 'hello' },
			'mockIssue'
		);

		expect(handler).toHaveBeenCalledWith(
			{ text: 'hello' },
			expect.objectContaining({
				model: 'test-model',
				event: expect.objectContaining({ request: expect.any(Request) }),
				issue: 'mockIssue'
			})
		);
	});
});
