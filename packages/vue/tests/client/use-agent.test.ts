import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vue', async () => {
	const actual = await vi.importActual<typeof import('vue')>('vue');
	return {
		...actual,
		onUnmounted: vi.fn(),
	};
});

import { useAgent } from '../../src/agent/index.js';
import { createMockResponse, createErrorResponse, flushPromises } from '../helpers.js';

describe('useAgent', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('send() adds user message and POSTs', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['Hi there']));
		const { messages, send } = useAgent({ fetch: mockFetch, endpoint: '/api/agent' });
		await send('Hello');

		expect(messages.value.length).toBe(2); // user + assistant
		expect(messages.value[0].role).toBe('user');
		expect(messages.value[0].content).toBe('Hello');
		expect(mockFetch).toHaveBeenCalledWith(
			'/api/agent',
			expect.objectContaining({ method: 'POST' })
		);
	});

	it('send() streams response into assistant message', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['Hello', ' World']));
		const { messages, send } = useAgent({ fetch: mockFetch, endpoint: '/api/agent' });
		await send('prompt');

		const assistant = messages.value[messages.value.length - 1];
		expect(assistant.role).toBe('assistant');
		expect(assistant.content).toBe('Hello World');
	});

	it('send() sets status to running then idle', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['hi']));
		const { status, send } = useAgent({ fetch: mockFetch, endpoint: '/api/agent' });

		const promise = send('prompt');
		expect(status.value).toBe('running');
		await promise;
		expect(status.value).toBe('idle');
	});

	it('stop() sets status to idle', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['hi']));
		const { status, stop } = useAgent({ fetch: mockFetch, endpoint: '/api/agent' });
		stop();
		expect(status.value).toBe('idle');
	});

	it('network error sets error state', async () => {
		const onError = vi.fn();
		const mockFetch = vi.fn().mockRejectedValue(new Error('Network fail'));
		const { error, status, send } = useAgent({ fetch: mockFetch, endpoint: '/api/agent', onError });
		await send('prompt');

		expect(error.value).toBeInstanceOf(Error);
		expect(error.value!.message).toBe('Network fail');
		expect(status.value).toBe('error');
		expect(onError).toHaveBeenCalled();
	});

	it('approve() clears pendingApproval', () => {
		const { pendingApproval, status, approve } = useAgent({ endpoint: '/api/agent' });
		pendingApproval.value = { id: 'abc', toolName: 'search', args: {} };
		status.value = 'awaiting-approval';

		approve('abc');

		expect(pendingApproval.value).toBe(null);
		expect(status.value).toBe('running');
	});

	it('deny() clears pendingApproval', () => {
		const { pendingApproval, status, deny } = useAgent({ endpoint: '/api/agent' });
		pendingApproval.value = { id: 'abc', toolName: 'search', args: {} };
		status.value = 'awaiting-approval';

		deny('abc');

		expect(pendingApproval.value).toBe(null);
		expect(status.value).toBe('idle');
	});
});
