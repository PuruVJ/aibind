import { describe, it, expect } from 'vitest';
import { parsePartialJSON, consumeTextStream } from '../../src/lib/internal/stream-utils.js';

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
});
