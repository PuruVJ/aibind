import { describe, it, expect } from 'vitest';
import { MessageTree } from '../src/message-tree';
import type { TreeNode, SerializedTree } from '../src/message-tree';

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

describe('MessageTree', () => {
	describe('construction', () => {
		it('creates an empty tree', () => {
			const tree = new MessageTree<Msg>();
			expect(tree.size).toBe(0);
			expect(tree.isEmpty).toBe(true);
			expect(tree.activeLeafId).toBeNull();
			expect(tree.rootIds).toEqual([]);
		});

		it('accepts custom ID generator', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const id = tree.append({ role: 'user', content: 'hi' });
			expect(id).toBe('id-1');
		});
	});

	describe('append', () => {
		it('appends first message as root', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const id = tree.append({ role: 'user', content: 'hello' });
			expect(tree.size).toBe(1);
			expect(tree.rootIds).toEqual([id]);
			expect(tree.activeLeafId).toBe(id);
		});

		it('appends second message as child of first', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const m1 = tree.append({ role: 'user', content: 'hello' });
			const m2 = tree.append({ role: 'assistant', content: 'hi!' });
			expect(tree.size).toBe(2);
			expect(tree.activeLeafId).toBe(m2);
			const node = tree.get(m2)!;
			expect(node.parentId).toBe(m1);
		});

		it('updates active leaf on each append', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			tree.append({ role: 'user', content: '1' });
			tree.append({ role: 'assistant', content: '2' });
			const m3 = tree.append({ role: 'user', content: '3' });
			expect(tree.activeLeafId).toBe(m3);
		});

		it('supports metadata on append', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const id = tree.append({ role: 'user', content: 'hi' }, { model: 'gpt-4' });
			const node = tree.get(id)!;
			expect(node.metadata).toEqual({ model: 'gpt-4' });
		});

		it('freezes message and metadata', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const msg = { role: 'user' as const, content: 'hi' };
			const meta = { key: 'value' };
			const id = tree.append(msg, meta);
			const node = tree.get(id)!;

			// Original objects should not affect stored node
			msg.content = 'changed';
			meta.key = 'changed';
			expect(node.message.content).toBe('hi');
			expect(node.metadata.key).toBe('value');
		});
	});

	describe('addChild', () => {
		it('adds child to specific parent', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const m1 = tree.append({ role: 'user', content: 'hello' });
			const m2 = tree.addChild(m1, { role: 'assistant', content: 'hi' });
			expect(tree.size).toBe(2);
			expect(tree.get(m2)!.parentId).toBe(m1);
			expect(tree.get(m1)!.children).toContain(m2);
		});

		it('does NOT update active leaf', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const m1 = tree.append({ role: 'user', content: 'hello' });
			tree.addChild(m1, { role: 'assistant', content: 'hi' });
			expect(tree.activeLeafId).toBe(m1);
		});

		it('throws on invalid parentId', () => {
			const tree = new MessageTree<Msg>();
			expect(() => tree.addChild('nonexistent', { role: 'user', content: '' }))
				.toThrow('does not exist');
		});

		it('handles multiple children (wide branching)', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const m1 = tree.append({ role: 'user', content: 'hello' });
			const c1 = tree.addChild(m1, { role: 'assistant', content: 'a' });
			const c2 = tree.addChild(m1, { role: 'assistant', content: 'b' });
			const c3 = tree.addChild(m1, { role: 'assistant', content: 'c' });
			expect(tree.get(m1)!.children).toEqual([c1, c2, c3]);
		});
	});

	describe('addRoot', () => {
		it('adds a root-level node', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const r1 = tree.addRoot({ role: 'user', content: 'first' });
			const r2 = tree.addRoot({ role: 'user', content: 'second' });
			expect(tree.rootIds).toEqual([r1, r2]);
			expect(tree.activeLeafId).toBe(r2);
		});
	});

	describe('branch', () => {
		it('creates sibling to existing child', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const m1 = tree.append({ role: 'user', content: 'hello' });
			const m2 = tree.append({ role: 'assistant', content: 'hi' });
			const m2b = tree.branch(m1, { role: 'assistant', content: 'hey!' });

			expect(tree.get(m1)!.children).toEqual([m2, m2b]);
			expect(tree.activeLeafId).toBe(m2b);
		});

		it('works for edit-message workflow', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const m1 = tree.append({ role: 'user', content: 'hello' });
			tree.append({ role: 'assistant', content: 'hi' });

			// "Edit" m1 by branching from root level
			const m1b = tree.addRoot({ role: 'user', content: 'hey' });
			expect(tree.rootIds.length).toBe(2);
			expect(tree.activeLeafId).toBe(m1b);
		});

		it('works for regenerate-response workflow', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const m1 = tree.append({ role: 'user', content: 'hello' });
			const m2 = tree.append({ role: 'assistant', content: 'response 1' });
			const m2b = tree.branch(m1, { role: 'assistant', content: 'response 2' });

			expect(tree.get(m1)!.children).toEqual([m2, m2b]);
			expect(tree.activeLeafId).toBe(m2b);
			expect(tree.getActivePath().messages).toEqual([
				{ role: 'user', content: 'hello' },
				{ role: 'assistant', content: 'response 2' },
			]);
		});

		it('throws on invalid parentId', () => {
			const tree = new MessageTree<Msg>();
			expect(() => tree.branch('nonexistent', { role: 'user', content: '' }))
				.toThrow('does not exist');
		});
	});

	describe('getActivePath', () => {
		it('returns empty path for empty tree', () => {
			const tree = new MessageTree<Msg>();
			const path = tree.getActivePath();
			expect(path.messages).toEqual([]);
			expect(path.nodeIds).toEqual([]);
		});

		it('returns single message for one-node tree', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const id = tree.append({ role: 'user', content: 'hello' });
			const path = tree.getActivePath();
			expect(path.messages).toEqual([{ role: 'user', content: 'hello' }]);
			expect(path.nodeIds).toEqual([id]);
		});

		it('returns full linear path for deep tree', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			tree.append({ role: 'user', content: '1' });
			tree.append({ role: 'assistant', content: '2' });
			tree.append({ role: 'user', content: '3' });
			tree.append({ role: 'assistant', content: '4' });
			const path = tree.getActivePath();
			expect(path.messages.map(m => m.content)).toEqual(['1', '2', '3', '4']);
		});

		it('returns correct path after branching', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const m1 = tree.append({ role: 'user', content: 'hello' });
			tree.append({ role: 'assistant', content: 'response A' });
			tree.branch(m1, { role: 'assistant', content: 'response B' });

			const path = tree.getActivePath();
			expect(path.messages).toEqual([
				{ role: 'user', content: 'hello' },
				{ role: 'assistant', content: 'response B' },
			]);
		});

		it('messages are in root-to-leaf order', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const ids: string[] = [];
			ids.push(tree.append({ role: 'user', content: 'a' }));
			ids.push(tree.append({ role: 'assistant', content: 'b' }));
			ids.push(tree.append({ role: 'user', content: 'c' }));
			const path = tree.getActivePath();
			expect(path.nodeIds).toEqual(ids);
		});
	});

	describe('getPathTo', () => {
		it('returns path to any arbitrary node', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const m1 = tree.append({ role: 'user', content: 'hello' });
			const m2 = tree.append({ role: 'assistant', content: 'hi' });
			tree.append({ role: 'user', content: 'next' });

			const path = tree.getPathTo(m2);
			expect(path.nodeIds).toEqual([m1, m2]);
			expect(path.messages.length).toBe(2);
		});

		it('throws on invalid nodeId', () => {
			const tree = new MessageTree<Msg>();
			expect(() => tree.getPathTo('nonexistent')).toThrow('does not exist');
		});

		it('works for non-active branches', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const m1 = tree.append({ role: 'user', content: 'hello' });
			const m2a = tree.append({ role: 'assistant', content: 'A' });
			tree.branch(m1, { role: 'assistant', content: 'B' });

			// m2a is not on the active path anymore
			const path = tree.getPathTo(m2a);
			expect(path.messages).toEqual([
				{ role: 'user', content: 'hello' },
				{ role: 'assistant', content: 'A' },
			]);
		});
	});

	describe('navigation', () => {
		describe('getSiblings', () => {
			it('returns siblings and index for child node', () => {
				const tree = new MessageTree<Msg>(freshConfig());
				const m1 = tree.append({ role: 'user', content: 'hello' });
				const c1 = tree.addChild(m1, { role: 'assistant', content: 'a' });
				const c2 = tree.addChild(m1, { role: 'assistant', content: 'b' });
				const c3 = tree.addChild(m1, { role: 'assistant', content: 'c' });

				const { siblings, index } = tree.getSiblings(c2);
				expect(siblings.map(s => s.id)).toEqual([c1, c2, c3]);
				expect(index).toBe(1);
			});

			it('returns root siblings for root node', () => {
				const tree = new MessageTree<Msg>(freshConfig());
				const r1 = tree.addRoot({ role: 'user', content: 'a' });
				const r2 = tree.addRoot({ role: 'user', content: 'b' });

				const { siblings, index } = tree.getSiblings(r1);
				expect(siblings.map(s => s.id)).toEqual([r1, r2]);
				expect(index).toBe(0);
			});

			it('single child returns siblings=[self], index=0', () => {
				const tree = new MessageTree<Msg>(freshConfig());
				const m1 = tree.append({ role: 'user', content: 'hello' });
				const m2 = tree.append({ role: 'assistant', content: 'hi' });

				const { siblings, index } = tree.getSiblings(m2);
				expect(siblings.length).toBe(1);
				expect(siblings[0].id).toBe(m2);
				expect(index).toBe(0);
			});

			it('throws on invalid nodeId', () => {
				const tree = new MessageTree<Msg>();
				expect(() => tree.getSiblings('nonexistent')).toThrow('does not exist');
			});
		});

		describe('nextSibling / prevSibling', () => {
			it('navigates right through siblings', () => {
				const tree = new MessageTree<Msg>(freshConfig());
				const m1 = tree.append({ role: 'user', content: 'hello' });
				const c1 = tree.addChild(m1, { role: 'assistant', content: 'a' });
				const c2 = tree.addChild(m1, { role: 'assistant', content: 'b' });

				tree.setActiveLeaf(c1);
				const result = tree.nextSibling(c1);
				expect(result).toBe(c2);
				expect(tree.activeLeafId).toBe(c2);
			});

			it('navigates left through siblings', () => {
				const tree = new MessageTree<Msg>(freshConfig());
				const m1 = tree.append({ role: 'user', content: 'hello' });
				const c1 = tree.addChild(m1, { role: 'assistant', content: 'a' });
				const c2 = tree.addChild(m1, { role: 'assistant', content: 'b' });

				tree.setActiveLeaf(c2);
				const result = tree.prevSibling(c2);
				expect(result).toBe(c1);
				expect(tree.activeLeafId).toBe(c1);
			});

			it('follows first-child chain to leaf after switch', () => {
				const tree = new MessageTree<Msg>(freshConfig());
				const m1 = tree.append({ role: 'user', content: 'hello' });
				const c1 = tree.addChild(m1, { role: 'assistant', content: 'a' });
				const c1_child = tree.addChild(c1, { role: 'user', content: 'next' });
				const c2 = tree.addChild(m1, { role: 'assistant', content: 'b' });

				tree.setActiveLeaf(c2);
				const result = tree.prevSibling(c2);
				// Should follow c1 → c1_child (leaf)
				expect(result).toBe(c1_child);
				expect(tree.activeLeafId).toBe(c1_child);
			});

			it('returns null at boundary (last sibling)', () => {
				const tree = new MessageTree<Msg>(freshConfig());
				const m1 = tree.append({ role: 'user', content: 'hello' });
				const c1 = tree.addChild(m1, { role: 'assistant', content: 'a' });

				const result = tree.nextSibling(c1);
				expect(result).toBeNull();
			});

			it('returns null at boundary (first sibling)', () => {
				const tree = new MessageTree<Msg>(freshConfig());
				const m1 = tree.append({ role: 'user', content: 'hello' });
				const c1 = tree.addChild(m1, { role: 'assistant', content: 'a' });

				const result = tree.prevSibling(c1);
				expect(result).toBeNull();
			});

			it('updates active leaf', () => {
				const tree = new MessageTree<Msg>(freshConfig());
				const m1 = tree.append({ role: 'user', content: 'hello' });
				const c1 = tree.addChild(m1, { role: 'assistant', content: 'a' });
				const c2 = tree.addChild(m1, { role: 'assistant', content: 'b' });

				tree.setActiveLeaf(c1);
				tree.nextSibling(c1);
				expect(tree.activeLeafId).toBe(c2);
			});
		});
	});

	describe('setActiveLeaf', () => {
		it('sets active leaf to specific node', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const m1 = tree.append({ role: 'user', content: 'hello' });
			const m2 = tree.append({ role: 'assistant', content: 'hi' });
			tree.setActiveLeaf(m1);
			expect(tree.activeLeafId).toBe(m1);
		});

		it('throws on invalid nodeId', () => {
			const tree = new MessageTree<Msg>();
			expect(() => tree.setActiveLeaf('nonexistent')).toThrow('does not exist');
		});
	});

	describe('serialization', () => {
		it('serialize() produces valid SerializedTree', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			tree.append({ role: 'user', content: 'hello' });
			tree.append({ role: 'assistant', content: 'hi' });

			const data = tree.serialize();
			expect(data.version).toBe(1);
			expect(Object.keys(data.nodes).length).toBe(2);
			expect(data.rootIds.length).toBe(1);
			expect(data.activeLeafId).toBe('id-2');
		});

		it('deserialize() reconstructs identical tree', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const m1 = tree.append({ role: 'user', content: 'hello' });
			const m2 = tree.append({ role: 'assistant', content: 'hi' });
			tree.branch(m1, { role: 'assistant', content: 'hey' });

			const data = tree.serialize();
			const restored = MessageTree.deserialize<Msg>(data);

			expect(restored.size).toBe(3);
			expect(restored.rootIds).toEqual(tree.rootIds);
			expect(restored.activeLeafId).toBe(tree.activeLeafId);
			expect(restored.getActivePath().messages).toEqual(tree.getActivePath().messages);
		});

		it('round-trip preserves all data', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			tree.append({ role: 'user', content: 'hello' }, { model: 'gpt-4' });
			tree.append({ role: 'assistant', content: 'hi' });

			const json = JSON.stringify(tree.serialize());
			const restored = MessageTree.deserialize<Msg>(JSON.parse(json));

			const node = restored.get(restored.rootIds[0])!;
			expect(node.message).toEqual({ role: 'user', content: 'hello' });
			expect(node.metadata).toEqual({ model: 'gpt-4' });
			expect(node.createdAt).toBeTruthy();
		});

		it('round-trip preserves active leaf', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const m1 = tree.append({ role: 'user', content: 'a' });
			tree.append({ role: 'assistant', content: 'b' });
			tree.setActiveLeaf(m1);

			const restored = MessageTree.deserialize<Msg>(tree.serialize());
			expect(restored.activeLeafId).toBe(m1);
		});

		it('deserialize() throws on malformed data (broken parent refs)', () => {
			const data: SerializedTree<Msg> = {
				version: 1,
				nodes: {
					'a': {
						id: 'a', message: { role: 'user', content: '' },
						parentId: 'nonexistent', children: [],
						metadata: {}, createdAt: '',
					},
				},
				rootIds: [],
				activeLeafId: null,
			};
			expect(() => MessageTree.deserialize(data)).toThrow('missing parent');
		});

		it('deserialize() throws on broken children refs', () => {
			const data: SerializedTree<Msg> = {
				version: 1,
				nodes: {
					'a': {
						id: 'a', message: { role: 'user', content: '' },
						parentId: null, children: ['nonexistent'],
						metadata: {}, createdAt: '',
					},
				},
				rootIds: ['a'],
				activeLeafId: null,
			};
			expect(() => MessageTree.deserialize(data)).toThrow('missing child');
		});

		it('deserialize() throws on cycle', () => {
			const data: SerializedTree<Msg> = {
				version: 1,
				nodes: {
					'a': {
						id: 'a', message: { role: 'user', content: '' },
						parentId: null, children: ['b'],
						metadata: {}, createdAt: '',
					},
					'b': {
						id: 'b', message: { role: 'assistant', content: '' },
						parentId: 'a', children: ['a'],
						metadata: {}, createdAt: '',
					},
				},
				rootIds: ['a'],
				activeLeafId: null,
			};
			expect(() => MessageTree.deserialize(data)).toThrow();
		});

		it('JSON.stringify(serialize()) works (no circular refs)', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			tree.append({ role: 'user', content: 'hello' });
			expect(() => JSON.stringify(tree.serialize())).not.toThrow();
		});

		it('deserialize() throws on invalid activeLeafId', () => {
			const data: SerializedTree<Msg> = {
				version: 1,
				nodes: {},
				rootIds: [],
				activeLeafId: 'nonexistent',
			};
			expect(() => MessageTree.deserialize(data)).toThrow('does not exist');
		});
	});

	describe('remove', () => {
		it('removes leaf node', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const m1 = tree.append({ role: 'user', content: 'hello' });
			const m2 = tree.append({ role: 'assistant', content: 'hi' });
			tree.remove(m2);
			expect(tree.size).toBe(1);
			expect(tree.has(m2)).toBe(false);
			expect(tree.get(m1)!.children.length).toBe(0);
		});

		it('removes subtree (node + all descendants)', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const m1 = tree.append({ role: 'user', content: 'hello' });
			const m2 = tree.append({ role: 'assistant', content: 'hi' });
			const m3 = tree.append({ role: 'user', content: 'more' });
			tree.remove(m2);
			expect(tree.size).toBe(1);
			expect(tree.has(m2)).toBe(false);
			expect(tree.has(m3)).toBe(false);
		});

		it('updates active leaf when removed subtree contains it', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const m1 = tree.append({ role: 'user', content: 'hello' });
			const m2 = tree.append({ role: 'assistant', content: 'hi' });
			tree.remove(m2);
			expect(tree.activeLeafId).toBe(m1);
		});

		it('adjusts parent children array', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const m1 = tree.append({ role: 'user', content: 'hello' });
			const c1 = tree.addChild(m1, { role: 'assistant', content: 'a' });
			const c2 = tree.addChild(m1, { role: 'assistant', content: 'b' });
			tree.remove(c1);
			expect(tree.get(m1)!.children).toEqual([c2]);
		});

		it('removes root node correctly', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const r1 = tree.addRoot({ role: 'user', content: 'a' });
			const r2 = tree.addRoot({ role: 'user', content: 'b' });
			tree.remove(r1);
			expect(tree.rootIds).toEqual([r2]);
			expect(tree.size).toBe(1);
		});

		it('sets active to null when all nodes removed', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const m1 = tree.append({ role: 'user', content: 'hello' });
			tree.remove(m1);
			expect(tree.activeLeafId).toBeNull();
			expect(tree.isEmpty).toBe(true);
		});

		it('throws on invalid nodeId', () => {
			const tree = new MessageTree<Msg>();
			expect(() => tree.remove('nonexistent')).toThrow('does not exist');
		});
	});

	describe('utility', () => {
		it('depth() returns 0 for root', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const m1 = tree.append({ role: 'user', content: 'hello' });
			expect(tree.depth(m1)).toBe(0);
		});

		it('depth() returns correct value for deep nodes', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			tree.append({ role: 'user', content: '1' });
			tree.append({ role: 'assistant', content: '2' });
			const m3 = tree.append({ role: 'user', content: '3' });
			expect(tree.depth(m3)).toBe(2);
		});

		it('getLeaves() returns all leaf nodes', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const m1 = tree.append({ role: 'user', content: 'hello' });
			const c1 = tree.addChild(m1, { role: 'assistant', content: 'a' });
			const c2 = tree.addChild(m1, { role: 'assistant', content: 'b' });

			const leaves = tree.getLeaves();
			const leafIds = leaves.map(l => l.id).sort();
			expect(leafIds).toEqual([c1, c2].sort());
		});

		it('get() returns node by ID', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const id = tree.append({ role: 'user', content: 'hello' });
			const node = tree.get(id);
			expect(node).toBeDefined();
			expect(node!.message.content).toBe('hello');
		});

		it('get() returns undefined for missing ID', () => {
			const tree = new MessageTree<Msg>();
			expect(tree.get('nonexistent')).toBeUndefined();
		});

		it('has() checks existence', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const id = tree.append({ role: 'user', content: 'hello' });
			expect(tree.has(id)).toBe(true);
			expect(tree.has('nonexistent')).toBe(false);
		});
	});

	describe('edge cases', () => {
		it('deep tree (100 levels): path extraction works', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			for (let i = 0; i < 100; i++) {
				tree.append({ role: i % 2 === 0 ? 'user' : 'assistant', content: `msg-${i}` });
			}
			const path = tree.getActivePath();
			expect(path.messages.length).toBe(100);
			expect(path.messages[0].content).toBe('msg-0');
			expect(path.messages[99].content).toBe('msg-99');
		});

		it('wide tree (50 siblings): navigation works', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const root = tree.append({ role: 'user', content: 'root' });
			const childIds: string[] = [];
			for (let i = 0; i < 50; i++) {
				childIds.push(tree.addChild(root, { role: 'assistant', content: `child-${i}` }));
			}
			expect(tree.get(root)!.children.length).toBe(50);

			tree.setActiveLeaf(childIds[0]);
			tree.nextSibling(childIds[0]);
			expect(tree.activeLeafId).toBe(childIds[1]);

			tree.setActiveLeaf(childIds[49]);
			tree.prevSibling(childIds[49]);
			expect(tree.activeLeafId).toBe(childIds[48]);
		});

		it('node createdAt has valid ISO string', () => {
			const tree = new MessageTree<Msg>(freshConfig());
			const id = tree.append({ role: 'user', content: 'hello' });
			const node = tree.get(id)!;
			expect(new Date(node.createdAt).toISOString()).toBe(node.createdAt);
		});
	});
});
