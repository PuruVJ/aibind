import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('solid-js', async () => {
	const actual = await vi.importActual<typeof import('solid-js')>('solid-js');
	return {
		...actual,
		onCleanup: vi.fn(),
	};
});

import { useStream } from '../../src/index.js';
import { createMockResponse, createErrorResponse, flushPromises } from '../helpers.js';

const ENDPOINT = '/api/stream';

describe('useStream', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('send() POSTs to endpoint', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['hello']));

		const { send, text } = useStream({ endpoint: ENDPOINT, fetch: mockFetch });
		send('test prompt');
		await flushPromises();

		expect(mockFetch).toHaveBeenCalledWith(
			ENDPOINT,
			expect.objectContaining({
				method: 'POST',
				body: expect.stringContaining('test prompt')
			})
		);
	});

	it('send() uses custom endpoint', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['hi']));

		const { send } = useStream({ endpoint: '/custom/stream', fetch: mockFetch });
		send('hello');
		await flushPromises();

		expect(mockFetch).toHaveBeenCalledWith('/custom/stream', expect.anything());
	});

	it('send() streams text chunks', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['Hello', ' ', 'World']));

		const { send, text } = useStream({ endpoint: ENDPOINT, fetch: mockFetch });
		send('prompt');
		await flushPromises();

		expect(text()).toBe('Hello World');
	});

	it('send() sets loading=true during stream, false after', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['hello']));

		const { send, loading } = useStream({ endpoint: ENDPOINT, fetch: mockFetch });
		send('prompt');

		expect(loading()).toBe(true);
		await flushPromises();
		expect(loading()).toBe(false);
	});

	it('send() sets done=true when stream completes', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['done']));

		const { send, done } = useStream({ endpoint: ENDPOINT, fetch: mockFetch });
		expect(done()).toBe(false);

		send('prompt');
		await flushPromises();

		expect(done()).toBe(true);
	});

	it('abort() aborts in-flight request', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['hello']));

		const { send, abort, error } = useStream({ endpoint: ENDPOINT, fetch: mockFetch });
		send('prompt');
		abort();
		await flushPromises();

		expect(error()).toBeNull();
	});

	it('retry() re-sends last prompt', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['response']));

		const { send, retry, text } = useStream({ endpoint: ENDPOINT, fetch: mockFetch });
		send('original prompt');
		await flushPromises();

		mockFetch.mockClear();
		mockFetch.mockResolvedValue(createMockResponse(['retry response']));

		retry();
		await flushPromises();

		expect(mockFetch).toHaveBeenCalledWith(
			ENDPOINT,
			expect.objectContaining({
				body: expect.stringContaining('original prompt')
			})
		);
		expect(text()).toBe('retry response');
	});

	it('network error sets .error and calls onError', async () => {
		const onError = vi.fn();
		const mockFetch = vi.fn().mockRejectedValue(new Error('Network failure'));

		const { send, error } = useStream({ endpoint: ENDPOINT, fetch: mockFetch, onError });
		send('prompt');
		await flushPromises();

		expect(error()).toBeInstanceOf(Error);
		expect(error()!.message).toBe('Network failure');
		expect(onError).toHaveBeenCalledWith(error());
	});

	it('HTTP error sets .error', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createErrorResponse(500, 'Internal Server Error'));

		const { send, error } = useStream({ endpoint: ENDPOINT, fetch: mockFetch });
		send('prompt');
		await flushPromises();

		expect(error()).toBeInstanceOf(Error);
		expect(error()!.message).toContain('500');
	});

	it('calls onFinish with final text', async () => {
		const onFinish = vi.fn();
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['hello world']));

		const { send } = useStream({ endpoint: ENDPOINT, fetch: mockFetch, onFinish });
		send('prompt');
		await flushPromises();

		expect(onFinish).toHaveBeenCalledWith('hello world');
	});
});
