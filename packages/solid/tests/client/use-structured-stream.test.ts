import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('solid-js', async () => {
	const actual = await vi.importActual<typeof import('solid-js')>('solid-js');
	return {
		...actual,
		onCleanup: vi.fn(),
	};
});

import { useStructuredStream } from '../../src/index.js';
import { createMockResponse, flushPromises } from '../helpers.js';

const ENDPOINT = '/api/structured';

function createFakeSchema(jsonSchema: Record<string, unknown> | null, vendor?: string) {
	return {
		'~standard': {
			version: 1,
			vendor: vendor ?? 'test',
			jsonSchema: jsonSchema ?? {},
			validate: vi.fn((value: unknown) => ({ value, issues: undefined })),
		},
	};
}

describe('useStructuredStream', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('resolves schema from ~standard.jsonSchema', async () => {
		const schema = createFakeSchema({ type: 'object', properties: { name: { type: 'string' } } });
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['{"name":"Alice"}']));

		const { send } = useStructuredStream({ schema: schema as never, fetch: mockFetch, endpoint: ENDPOINT });
		send('prompt');
		await flushPromises();

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.schema).toEqual({ type: 'object', properties: { name: { type: 'string' } } });
	});

	it('resolves schema from toJsonSchema() method', async () => {
		const schema = {
			'~standard': {
				version: 1,
				vendor: 'test',
				jsonSchema: {},
				validate: vi.fn((value: unknown) => ({ value, issues: undefined })),
			},
			toJsonSchema: () => ({ type: 'object', properties: { id: { type: 'number' } } }),
		};
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['{"id":1}']));

		const { send } = useStructuredStream({ schema: schema as never, fetch: mockFetch, endpoint: ENDPOINT });
		send('prompt');
		await flushPromises();

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.schema).toEqual({ type: 'object', properties: { id: { type: 'number' } } });
	});

	it('final JSON validates and sets .data', async () => {
		const schema = createFakeSchema({ type: 'object' });
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['{"score":0.9}']));

		const { data, send } = useStructuredStream({ schema: schema as never, fetch: mockFetch, endpoint: ENDPOINT });
		send('prompt');
		await flushPromises();

		expect(data()).toEqual({ score: 0.9 });
	});

	it('validation failure sets .error', async () => {
		const schema = {
			'~standard': {
				version: 1,
				vendor: 'test',
				jsonSchema: { type: 'object' },
				validate: vi.fn(() => ({
					value: undefined,
					issues: [{ message: 'invalid type' }],
				})),
			},
		};
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['{"bad":true}']));

		const { error, send } = useStructuredStream({ schema: schema as never, fetch: mockFetch, endpoint: ENDPOINT });
		send('prompt');
		await flushPromises();

		expect(error()).toBeInstanceOf(Error);
		expect(error()!.message).toContain('invalid type');
	});

	it('calls onFinish with validated data', async () => {
		const onFinish = vi.fn();
		const schema = createFakeSchema({ type: 'object' });
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['{"ok":true}']));

		const { send } = useStructuredStream({ schema: schema as never, fetch: mockFetch, endpoint: ENDPOINT, onFinish });
		send('prompt');
		await flushPromises();

		expect(onFinish).toHaveBeenCalledWith({ ok: true });
	});

	it('schema resolution is cached', async () => {
		const toJsonSchema = vi.fn(() => ({ type: 'object' }));
		const schema = {
			'~standard': {
				version: 1,
				vendor: 'test',
				jsonSchema: {},
				validate: vi.fn((value: unknown) => ({ value, issues: undefined })),
			},
			toJsonSchema,
		};
		const mockFetch = vi.fn().mockResolvedValue(createMockResponse(['{"a":1}']));

		const { send } = useStructuredStream({ schema: schema as never, fetch: mockFetch, endpoint: ENDPOINT });
		send('first');
		await flushPromises();

		mockFetch.mockResolvedValue(createMockResponse(['{"a":2}']));
		send('second');
		await flushPromises();

		expect(toJsonSchema).toHaveBeenCalledTimes(1);
	});
});
