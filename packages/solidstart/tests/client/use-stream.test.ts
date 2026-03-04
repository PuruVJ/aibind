import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('solid-js', async () => {
	const actual = await vi.importActual<typeof import('solid-js')>('solid-js');
	return {
		...actual,
		onCleanup: vi.fn(),
	};
});

import { useStream } from '../../src/index.js';
import { createMockResponse, flushPromises } from '../helpers.js';

describe('useStream (SolidStart wrapper)', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('uses default endpoint /api/__aibind__/stream', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['hello']));

		const { send } = useStream({ fetch: mockFetch });
		send('test');
		await flushPromises();

		expect(mockFetch).toHaveBeenCalledWith(
			'/api/__aibind__/stream',
			expect.anything()
		);
	});

	it('allows overriding endpoint', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['hello']));

		const { send } = useStream({ endpoint: '/custom/stream', fetch: mockFetch });
		send('test');
		await flushPromises();

		expect(mockFetch).toHaveBeenCalledWith(
			'/custom/stream',
			expect.anything()
		);
	});

	it('streams text chunks', async () => {
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['Hello', ' World']));

		const { send, text } = useStream({ fetch: mockFetch });
		send('prompt');
		await flushPromises();

		expect(text()).toBe('Hello World');
	});
});
