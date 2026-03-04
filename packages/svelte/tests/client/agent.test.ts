import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('svelte', () => ({ onDestroy: vi.fn() }));

import { Agent } from '../../src/lib/agent/agent.svelte.js';
import { createMockResponse, createErrorResponse, flushPromises } from '../helpers.js';

const ENDPOINT = '/api/agent';

describe('Agent (client)', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('send() adds user message and POSTs', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['hi']));

		const agent = new Agent({ endpoint: ENDPOINT, fetch: mockFetch });
		agent.send('hello');
		await flushPromises();

		expect(agent.messages[0]).toEqual(
			expect.objectContaining({ role: 'user', content: 'hello' })
		);
		expect(mockFetch).toHaveBeenCalledWith(
			ENDPOINT,
			expect.objectContaining({
				method: 'POST',
				body: expect.stringContaining('hello')
			})
		);
	});

	it('send() streams response into assistant message', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['Hello', ' World']));

		const agent = new Agent({ endpoint: ENDPOINT, fetch: mockFetch });
		agent.send('greet me');
		await flushPromises();

		expect(agent.messages).toHaveLength(2);
		expect(agent.messages[1]).toEqual(
			expect.objectContaining({ role: 'assistant', content: 'Hello World' })
		);
		expect(agent.status).toBe('idle');
	});

	it('stop() aborts request and sets status idle', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['hello']));

		const agent = new Agent({ endpoint: ENDPOINT, fetch: mockFetch });
		agent.send('prompt');
		agent.stop();
		await flushPromises();

		expect(agent.status).toBe('idle');
	});

	it('approve() clears pendingApproval', () => {
		const agent = new Agent({ endpoint: ENDPOINT });
		agent.pendingApproval = { id: 'abc', toolName: 'search', args: {} };
		agent.status = 'awaiting-approval';

		agent.approve('abc');

		expect(agent.pendingApproval).toBeNull();
		expect(agent.status).toBe('running');
	});

	it('deny() clears pendingApproval and sets idle', () => {
		const agent = new Agent({ endpoint: ENDPOINT });
		agent.pendingApproval = { id: 'abc', toolName: 'search', args: {} };
		agent.status = 'awaiting-approval';

		agent.deny('abc', 'not allowed');

		expect(agent.pendingApproval).toBeNull();
		expect(agent.status).toBe('idle');
	});

	it('network error sets error state and calls onError', async () => {
		const onError = vi.fn();
		const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

		const agent = new Agent({ endpoint: ENDPOINT, fetch: mockFetch, onError });
		agent.send('prompt');
		await flushPromises();

		expect(agent.status).toBe('error');
		expect(agent.error).toBeInstanceOf(Error);
		expect(agent.error!.message).toBe('Connection refused');
		expect(onError).toHaveBeenCalledWith(agent.error);
	});
});
