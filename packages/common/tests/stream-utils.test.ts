import { describe, it, expect } from 'vitest';
import { parsePartialJSON, consumeTextStream } from '../src/index.js';

describe('parsePartialJSON', () => {
	it('parses complete JSON', () => {
		expect(parsePartialJSON('{"name":"test","value":42}')).toEqual({
			name: 'test',
			value: 42
		});
	});

	it('parses JSON with unclosed brace', () => {
		expect(parsePartialJSON('{"name":"test"')).toEqual({ name: 'test' });
	});

	it('parses JSON with unclosed string and brace', () => {
		expect(parsePartialJSON('{"name":"tes')).toEqual({ name: 'tes' });
	});

	it('parses JSON with unclosed array', () => {
		expect(parsePartialJSON('{"items":[1,2,3')).toEqual({ items: [1, 2, 3] });
	});

	it('parses nested incomplete JSON', () => {
		expect(parsePartialJSON('{"a":{"b":"c"')).toEqual({ a: { b: 'c' } });
	});

	it('handles trailing comma', () => {
		expect(parsePartialJSON('{"a":1,"b":2,')).toEqual({ a: 1, b: 2 });
	});

	it('returns null for empty string', () => {
		expect(parsePartialJSON('')).toBeNull();
	});

	it('returns null for completely invalid input', () => {
		expect(parsePartialJSON('not json at all {')).toBeNull();
	});

	it('parses complete arrays', () => {
		expect(parsePartialJSON('[1,2,3]')).toEqual([1, 2, 3]);
	});

	it('parses incomplete arrays', () => {
		expect(parsePartialJSON('[1,2,3')).toEqual([1, 2, 3]);
	});
});

describe('consumeTextStream', () => {
	it('yields chunks from a ReadableStream', async () => {
		const chunks = ['Hello', ' ', 'World'];
		const stream = new ReadableStream({
			start(controller) {
				for (const chunk of chunks) {
					controller.enqueue(new TextEncoder().encode(chunk));
				}
				controller.close();
			}
		});

		const response = new Response(stream);
		const result: string[] = [];
		for await (const chunk of consumeTextStream(response)) {
			result.push(chunk);
		}

		expect(result.join('')).toBe('Hello World');
	});

	it('handles empty stream', async () => {
		const stream = new ReadableStream({
			start(controller) {
				controller.close();
			}
		});

		const response = new Response(stream);
		const result: string[] = [];
		for await (const chunk of consumeTextStream(response)) {
			result.push(chunk);
		}

		expect(result.join('')).toBe('');
	});

	it('handles stream error mid-read', async () => {
		let enqueueRef: ReadableStreamDefaultController<Uint8Array>;
		const stream = new ReadableStream({
			start(controller) {
				enqueueRef = controller;
			}
		});

		setTimeout(() => {
			enqueueRef.enqueue(new TextEncoder().encode('hello'));
			enqueueRef.error(new Error('stream broke'));
		}, 0);

		const response = new Response(stream);
		const result: string[] = [];

		await expect(async () => {
			for await (const chunk of consumeTextStream(response)) {
				result.push(chunk);
			}
		}).rejects.toThrow('stream broke');

		expect(result).toEqual(['hello']);
	});

	it('handles multi-byte UTF-8 characters', async () => {
		const text = 'Hello 🌍 World';
		const encoded = new TextEncoder().encode(text);
		const mid = encoded.indexOf(0xf0);
		const chunk1 = encoded.slice(0, mid + 2);
		const chunk2 = encoded.slice(mid + 2);

		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(chunk1);
				controller.enqueue(chunk2);
				controller.close();
			}
		});

		const response = new Response(stream);
		const result: string[] = [];
		for await (const chunk of consumeTextStream(response)) {
			result.push(chunk);
		}

		expect(result.join('')).toBe(text);
	});
});

describe('parsePartialJSON edge cases', () => {
	it('handles strings with escaped quotes', () => {
		expect(parsePartialJSON('{"msg":"he said \\"hello\\""}')).toEqual({
			msg: 'he said "hello"'
		});
	});

	it('handles incomplete string with escaped quote', () => {
		expect(parsePartialJSON('{"msg":"he said \\"hel')).toEqual({
			msg: 'he said "hel'
		});
	});

	it('handles deeply nested incomplete objects', () => {
		expect(parsePartialJSON('{"a":{"b":{"c":"d"')).toEqual({
			a: { b: { c: 'd' } }
		});
	});

	it('handles incomplete array inside object', () => {
		expect(parsePartialJSON('{"items":[{"id":1},{"id":2}')).toEqual({
			items: [{ id: 1 }, { id: 2 }]
		});
	});
});
