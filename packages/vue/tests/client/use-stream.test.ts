import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vue', async () => {
	const actual = await vi.importActual<typeof import('vue')>('vue');
	return {
		...actual,
		onUnmounted: vi.fn(),
	};
});

import { useStream } from '../../src/index.js';
import { createMockResponse, createErrorResponse, flushPromises } from '../helpers.js';

const ENDPOINT = '/api/stream';

describe('useStream', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('send() POSTs to provided endpoint', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['hello']));
		const { send } = useStream({ fetch: mockFetch, endpoint: ENDPOINT });
		send('test prompt');
		await flushPromises();

		expect(mockFetch).toHaveBeenCalledWith(
			ENDPOINT,
			expect.objectContaining({
				method: 'POST',
				body: expect.stringContaining('test prompt'),
			})
		);
	});

	it('send() uses custom endpoint', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['hi']));
		const { send } = useStream({ fetch: mockFetch, endpoint: '/custom/stream' });
		send('prompt');
		await flushPromises();

		expect(mockFetch).toHaveBeenCalledWith('/custom/stream', expect.anything());
	});

	it('send() streams text chunks into .text', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['Hello', ' World']));
		const { text, send } = useStream({ fetch: mockFetch, endpoint: ENDPOINT });
		send('prompt');
		await flushPromises();

		expect(text.value).toBe('Hello World');
	});

	it('send() sets loading=true during, false after', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['hi']));
		const { loading, send } = useStream({ fetch: mockFetch, endpoint: ENDPOINT });
		send('prompt');
		expect(loading.value).toBe(true);
		await flushPromises();
		expect(loading.value).toBe(false);
	});

	it('send() sets done=true on completion', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['done']));
		const { done, send } = useStream({ fetch: mockFetch, endpoint: ENDPOINT });
		send('prompt');
		await flushPromises();
		expect(done.value).toBe(true);
	});

	it('send() calls onFinish', async () => {
		const onFinish = vi.fn();
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['result']));
		const { send } = useStream({ fetch: mockFetch, endpoint: ENDPOINT, onFinish });
		send('prompt');
		await flushPromises();

		expect(onFinish).toHaveBeenCalledWith('result');
	});

	it('retry() re-sends last prompt', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['hi']));
		const { send, retry } = useStream({ fetch: mockFetch, endpoint: ENDPOINT });
		send('original prompt');
		await flushPromises();

		mockFetch.mockResolvedValue(createMockResponse(['again']));
		retry();
		await flushPromises();

		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(mockFetch).toHaveBeenLastCalledWith(
			ENDPOINT,
			expect.objectContaining({ body: expect.stringContaining('original prompt') })
		);
	});

	it('network error sets .error and calls onError', async () => {
		const onError = vi.fn();
		const mockFetch = vi.fn().mockRejectedValue(new Error('Network down'));
		const { error, send } = useStream({ fetch: mockFetch, endpoint: ENDPOINT, onError });
		send('prompt');
		await flushPromises();

		expect(error.value).toBeInstanceOf(Error);
		expect(error.value!.message).toBe('Network down');
		expect(onError).toHaveBeenCalledWith(error.value);
	});

	it('HTTP error sets .error', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createErrorResponse(500));
		const { error, send } = useStream({ fetch: mockFetch, endpoint: ENDPOINT });
		send('prompt');
		await flushPromises();

		expect(error.value).toBeInstanceOf(Error);
		expect(error.value!.message).toContain('500');
	});

	it('send() includes model in body', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['hi']));
		const { send } = useStream({ fetch: mockFetch, endpoint: ENDPOINT, model: 'fast' });
		send('prompt');
		await flushPromises();

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.model).toBe('fast');
	});
});
