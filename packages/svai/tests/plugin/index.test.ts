import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { svai } from '../../src/lib/plugin/index.js';

vi.mock('node:fs', () => ({
	existsSync: vi.fn(),
	mkdirSync: vi.fn(),
	writeFileSync: vi.fn()
}));

vi.mock('ai', () => ({
	streamText: vi.fn(() => ({
		toTextStreamResponse: () => new Response('stream')
	})),
	Output: { json: vi.fn() }
}));

const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

describe('svai vite plugin', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('has the correct plugin name', () => {
		const plugin = svai();
		expect(plugin.name).toBe('svai');
	});

	it('creates stream and structured endpoints on configResolved', () => {
		mockExistsSync.mockReturnValue(false);

		const plugin = svai();
		const configResolved = plugin.configResolved as (config: { root: string }) => void;
		configResolved({ root: '/project' });

		expect(mockMkdirSync).toHaveBeenCalledTimes(2);
		expect(mockWriteFileSync).toHaveBeenCalledTimes(2);

		// Verify stream endpoint
		expect(mockWriteFileSync).toHaveBeenCalledWith(
			expect.stringContaining('stream/+server.ts'),
			expect.stringContaining('streamText')
		);

		// Verify structured endpoint
		expect(mockWriteFileSync).toHaveBeenCalledWith(
			expect.stringContaining('structured/+server.ts'),
			expect.stringContaining('Output.json')
		);
	});

	it('does not overwrite existing files', () => {
		mockExistsSync.mockReturnValue(true);

		const plugin = svai();
		const configResolved = plugin.configResolved as (config: { root: string }) => void;
		configResolved({ root: '/project' });

		expect(mockWriteFileSync).not.toHaveBeenCalled();
	});

	it('skips route generation when skipRouteGeneration is true', () => {
		const plugin = svai({ skipRouteGeneration: true });
		const configResolved = plugin.configResolved as (config: { root: string }) => void;
		configResolved({ root: '/project' });

		expect(mockMkdirSync).not.toHaveBeenCalled();
		expect(mockWriteFileSync).not.toHaveBeenCalled();
	});

	it('uses custom route prefix', () => {
		mockExistsSync.mockReturnValue(false);

		const plugin = svai({ routePrefix: '/api/ai' });
		const configResolved = plugin.configResolved as (config: { root: string }) => void;
		configResolved({ root: '/project' });

		expect(mockWriteFileSync).toHaveBeenCalledWith(
			expect.stringContaining('/api/ai/stream/+server.ts'),
			expect.any(String)
		);
	});
});
