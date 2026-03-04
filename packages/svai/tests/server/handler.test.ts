import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ai', () => ({
	streamText: vi.fn(() => ({
		toTextStreamResponse: () => new Response('stream response')
	})),
	Output: {
		json: vi.fn(() => 'json-output'),
		object: vi.fn((opts: unknown) => ({ type: 'object', ...(opts as object) }))
	},
	jsonSchema: vi.fn((s: unknown) => s)
}));

import { createStreamHandler } from '../../src/lib/server/handler.js';
import { streamText } from 'ai';

const mockStreamText = vi.mocked(streamText);

function makeEvent(pathname: string, body: Record<string, unknown>) {
	return {
		url: new URL(`http://localhost${pathname}`),
		request: new Request(`http://localhost${pathname}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		})
	};
}

const mockResolve = vi.fn(() => Promise.resolve(new Response('resolved')));

describe('createStreamHandler', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('handles /api/svai/stream requests', async () => {
		const handle = createStreamHandler({ model: 'test-model' });
		const event = makeEvent('/api/svai/stream', { prompt: 'hello', system: 'be nice' });

		const response = await handle({ event, resolve: mockResolve });

		expect(mockStreamText).toHaveBeenCalledWith(
			expect.objectContaining({
				model: 'test-model',
				prompt: 'hello',
				system: 'be nice'
			})
		);
		expect(mockResolve).not.toHaveBeenCalled();
		expect(response).toBeInstanceOf(Response);
	});

	it('handles /api/svai/structured requests', async () => {
		const handle = createStreamHandler({ model: 'test-model' });
		const event = makeEvent('/api/svai/structured', { prompt: 'analyze this' });

		await handle({ event, resolve: mockResolve });

		expect(mockStreamText).toHaveBeenCalledWith(
			expect.objectContaining({
				model: 'test-model',
				prompt: 'analyze this'
			})
		);
	});

	it('returns 400 for missing prompt', async () => {
		const handle = createStreamHandler({ model: 'test-model' });
		const event = makeEvent('/api/svai/stream', { prompt: '' });

		const response = await handle({ event, resolve: mockResolve });

		expect(response.status).toBe(400);
		expect(mockStreamText).not.toHaveBeenCalled();
	});

	it('falls through to resolve for non-matching routes', async () => {
		const handle = createStreamHandler({ model: 'test-model' });
		const event = makeEvent('/other', { prompt: 'hello' });

		await handle({ event, resolve: mockResolve });

		expect(mockResolve).toHaveBeenCalledWith(event);
		expect(mockStreamText).not.toHaveBeenCalled();
	});

	it('supports custom prefix', async () => {
		const handle = createStreamHandler({ model: 'test-model', prefix: '/api/ai' });
		const event = makeEvent('/api/ai/stream', { prompt: 'hello' });

		await handle({ event, resolve: mockResolve });

		expect(mockStreamText).toHaveBeenCalled();
	});

	it('resolves named model from request body', async () => {
		const handle = createStreamHandler({
			models: { fast: 'fast-model', smart: 'smart-model' }
		});
		const event = makeEvent('/api/svai/stream', { prompt: 'hello', model: 'fast' });

		await handle({ event, resolve: mockResolve });

		expect(mockStreamText).toHaveBeenCalledWith(
			expect.objectContaining({ model: 'fast-model' })
		);
	});

	it('uses first model as default when no model key sent', async () => {
		const handle = createStreamHandler({
			models: { default: 'default-model', fast: 'fast-model' }
		});
		const event = makeEvent('/api/svai/stream', { prompt: 'hello' });

		await handle({ event, resolve: mockResolve });

		expect(mockStreamText).toHaveBeenCalledWith(
			expect.objectContaining({ model: 'default-model' })
		);
	});

	it('throws for unknown model key', async () => {
		const handle = createStreamHandler({
			models: { fast: 'fast-model' }
		});
		const event = makeEvent('/api/svai/stream', { prompt: 'hello', model: 'unknown' });

		const response = await handle({ event, resolve: mockResolve });

		expect(response.status).toBe(400);
	});

	it('returns error when no model configured', async () => {
		const handle = createStreamHandler({});
		const event = makeEvent('/api/svai/stream', { prompt: 'hello' });

		const response = await handle({ event, resolve: mockResolve });

		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toMatch(/No model configured/);
	});

	it('falls through for GET requests', async () => {
		const handle = createStreamHandler({ model: 'test-model' });
		const event = {
			url: new URL('http://localhost/api/svai/stream'),
			request: new Request('http://localhost/api/svai/stream', { method: 'GET' })
		};

		await handle({ event, resolve: mockResolve });

		expect(mockResolve).toHaveBeenCalledWith(event);
		expect(mockStreamText).not.toHaveBeenCalled();
	});

	it('returns 400 for whitespace-only prompt', async () => {
		const handle = createStreamHandler({ model: 'test-model' });
		const event = makeEvent('/api/svai/stream', { prompt: '   ' });

		const response = await handle({ event, resolve: mockResolve });

		expect(response.status).toBe(400);
		expect(mockStreamText).not.toHaveBeenCalled();
	});

	it('handles structured endpoint with schema in body', async () => {
		const handle = createStreamHandler({ model: 'test-model' });
		const schema = { type: 'object', properties: { name: { type: 'string' } } };
		const event = makeEvent('/api/svai/structured', { prompt: 'extract', schema });

		await handle({ event, resolve: mockResolve });

		expect(mockStreamText).toHaveBeenCalledWith(
			expect.objectContaining({
				model: 'test-model',
				prompt: 'extract',
				output: expect.anything()
			})
		);
	});
});
