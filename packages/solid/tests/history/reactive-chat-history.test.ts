import { describe, it, expect } from 'vitest';
import { createRoot } from 'solid-js';
import { ReactiveChatHistory } from '../../src/history/reactive-chat-history';

interface Msg {
	role: 'user' | 'assistant';
	content: string;
}

let counter = 0;
const testConfig = { generateId: () => `id-${++counter}` };

function freshConfig() {
	counter = 0;
	return testConfig;
}

describe('ReactiveChatHistory (Solid)', () => {
	it('starts empty', () => {
		createRoot((dispose) => {
			const chat = new ReactiveChatHistory<Msg>();
			expect(chat.messages()).toEqual([]);
			expect(chat.nodeIds()).toEqual([]);
			expect(chat.isEmpty()).toBe(true);
			expect(chat.size()).toBe(0);
			dispose();
		});
	});

	it('append updates messages accessor', () => {
		createRoot((dispose) => {
			const chat = new ReactiveChatHistory<Msg>(freshConfig());
			expect(chat.messages()).toEqual([]);

			chat.append({ role: 'user', content: 'Hello' });
			expect(chat.messages()).toHaveLength(1);
			expect(chat.messages()[0].content).toBe('Hello');

			chat.append({ role: 'assistant', content: 'Hi!' });
			expect(chat.messages()).toHaveLength(2);
			expect(chat.messages()[1].content).toBe('Hi!');
			dispose();
		});
	});

	it('append returns node ID', () => {
		createRoot((dispose) => {
			const chat = new ReactiveChatHistory<Msg>(freshConfig());
			const id = chat.append({ role: 'user', content: 'Hello' });
			expect(id).toBe('id-1');
			dispose();
		});
	});

	it('nodeIds accessor matches messages', () => {
		createRoot((dispose) => {
			const chat = new ReactiveChatHistory<Msg>(freshConfig());
			const m1 = chat.append({ role: 'user', content: 'a' });
			const m2 = chat.append({ role: 'assistant', content: 'b' });
			expect(chat.nodeIds()).toEqual([m1, m2]);
			dispose();
		});
	});

	it('isEmpty becomes false after append', () => {
		createRoot((dispose) => {
			const chat = new ReactiveChatHistory<Msg>(freshConfig());
			expect(chat.isEmpty()).toBe(true);
			chat.append({ role: 'user', content: 'hi' });
			expect(chat.isEmpty()).toBe(false);
			dispose();
		});
	});

	it('size tracks total nodes across branches', () => {
		createRoot((dispose) => {
			const chat = new ReactiveChatHistory<Msg>(freshConfig());
			expect(chat.size()).toBe(0);
			chat.append({ role: 'user', content: 'hello' });
			expect(chat.size()).toBe(1);
			const m2 = chat.append({ role: 'assistant', content: 'a' });
			expect(chat.size()).toBe(2);
			chat.regenerate(m2, { role: 'assistant', content: 'b' });
			expect(chat.size()).toBe(3);
			dispose();
		});
	});

	it('edit creates a branch and updates messages', () => {
		createRoot((dispose) => {
			const chat = new ReactiveChatHistory<Msg>(freshConfig());
			const m1 = chat.append({ role: 'user', content: 'hello' });
			chat.append({ role: 'assistant', content: 'hi' });
			expect(chat.messages()).toHaveLength(2);

			const m1b = chat.edit(m1, { role: 'user', content: 'hey' });
			expect(m1b).not.toBe(m1);
			expect(chat.messages()).toHaveLength(1);
			expect(chat.messages()[0].content).toBe('hey');
			dispose();
		});
	});

	it('regenerate creates alternative response', () => {
		createRoot((dispose) => {
			const chat = new ReactiveChatHistory<Msg>(freshConfig());
			chat.append({ role: 'user', content: 'hello' });
			const m2 = chat.append({ role: 'assistant', content: 'response 1' });

			const m2b = chat.regenerate(m2, { role: 'assistant', content: 'response 2' });
			expect(m2b).not.toBe(m2);
			expect(chat.messages()[1].content).toBe('response 2');
			dispose();
		});
	});

	it('hasAlternatives returns false for single child', () => {
		createRoot((dispose) => {
			const chat = new ReactiveChatHistory<Msg>(freshConfig());
			chat.append({ role: 'user', content: 'hello' });
			const m2 = chat.append({ role: 'assistant', content: 'hi' });
			expect(chat.hasAlternatives(m2)).toBe(false);
			dispose();
		});
	});

	it('hasAlternatives returns true after regenerate', () => {
		createRoot((dispose) => {
			const chat = new ReactiveChatHistory<Msg>(freshConfig());
			chat.append({ role: 'user', content: 'hello' });
			const m2 = chat.append({ role: 'assistant', content: 'response 1' });
			chat.regenerate(m2, { role: 'assistant', content: 'response 2' });
			expect(chat.hasAlternatives(m2)).toBe(true);
			dispose();
		});
	});

	it('alternativeCount and alternativeIndex', () => {
		createRoot((dispose) => {
			const chat = new ReactiveChatHistory<Msg>(freshConfig());
			chat.append({ role: 'user', content: 'hello' });
			const m2 = chat.append({ role: 'assistant', content: 'a' });
			const m2b = chat.regenerate(m2, { role: 'assistant', content: 'b' });
			const m2c = chat.regenerate(m2, { role: 'assistant', content: 'c' });

			expect(chat.alternativeCount(m2)).toBe(3);
			expect(chat.alternativeIndex(m2)).toBe(0);
			expect(chat.alternativeIndex(m2b)).toBe(1);
			expect(chat.alternativeIndex(m2c)).toBe(2);
			dispose();
		});
	});

	it('nextAlternative switches branch and updates messages', () => {
		createRoot((dispose) => {
			const chat = new ReactiveChatHistory<Msg>(freshConfig());
			chat.append({ role: 'user', content: 'hello' });
			const m2 = chat.append({ role: 'assistant', content: 'response 1' });
			chat.regenerate(m2, { role: 'assistant', content: 'response 2' });

			// Currently on response 2 — navigate back to response 1
			chat.prevAlternative(chat.nodeIds()[1]);
			expect(chat.messages()[1].content).toBe('response 1');

			// Navigate forward to response 2
			chat.nextAlternative(chat.nodeIds()[1]);
			expect(chat.messages()[1].content).toBe('response 2');
			dispose();
		});
	});

	it('prevAlternative switches branch and updates messages', () => {
		createRoot((dispose) => {
			const chat = new ReactiveChatHistory<Msg>(freshConfig());
			chat.append({ role: 'user', content: 'hello' });
			const m2 = chat.append({ role: 'assistant', content: 'a' });
			const m2b = chat.regenerate(m2, { role: 'assistant', content: 'b' });

			// Currently on 'b' (active after regenerate)
			chat.prevAlternative(m2b);
			expect(chat.messages()[1].content).toBe('a');
			dispose();
		});
	});

	it('toJSON produces valid JSON string', () => {
		createRoot((dispose) => {
			const chat = new ReactiveChatHistory<Msg>(freshConfig());
			chat.append({ role: 'user', content: 'hello' });
			chat.append({ role: 'assistant', content: 'hi' });

			const json = chat.toJSON();
			expect(() => JSON.parse(json)).not.toThrow();
			dispose();
		});
	});

	it('fromJSON reconstructs identical history with reactive accessors', () => {
		createRoot((dispose) => {
			const chat = new ReactiveChatHistory<Msg>(freshConfig());
			chat.append({ role: 'user', content: 'hello' });
			chat.append({ role: 'assistant', content: 'hi' });

			const json = chat.toJSON();

			// fromJSON must also be inside a reactive root
			const restored = ReactiveChatHistory.fromJSON<Msg>(json);
			expect(restored.messages()).toEqual(chat.messages());
			expect(restored.size()).toBe(chat.size());
			expect(restored.isEmpty()).toBe(false);

			// Restored instance should still be mutable/reactive
			restored.append({ role: 'user', content: 'more' });
			expect(restored.messages()).toHaveLength(3);
			dispose();
		});
	});

	it('fromJSON round-trip preserves branches and active state', () => {
		createRoot((dispose) => {
			const chat = new ReactiveChatHistory<Msg>(freshConfig());
			chat.append({ role: 'user', content: 'hello' });
			const m2 = chat.append({ role: 'assistant', content: 'response 1' });
			chat.regenerate(m2, { role: 'assistant', content: 'response 2' });

			const restored = ReactiveChatHistory.fromJSON<Msg>(chat.toJSON());
			expect(restored.messages()).toEqual(chat.messages());
			expect(restored.size()).toBe(3);
			expect(restored.hasAlternatives(restored.nodeIds()[1])).toBe(true);
			dispose();
		});
	});
});
