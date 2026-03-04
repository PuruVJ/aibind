import { createSignal, createMemo, type Accessor } from 'solid-js';
import {
	MessageTree,
	type TreeConfig,
	type TreeNode,
	type TreePath,
	type SerializedTree,
} from '@aibind/core';

/**
 * SolidJS reactive wrapper around {@link MessageTree}.
 *
 * All mutations automatically trigger reactive updates via SolidJS signals.
 * Derived state (`size`, `isEmpty`, `activeLeafId`, `rootIds`, `activePath`)
 * are exposed as `Accessor` functions that update when the underlying data changes.
 *
 * Access the underlying `MessageTree` via the `inner` property for
 * non-reactive operations or direct tree access.
 *
 * @example
 * ```tsx
 * import { ReactiveMessageTree } from '@aibind/solid/history';
 *
 * function TreeView() {
 *   const tree = new ReactiveMessageTree<{ role: string; content: string }>();
 *
 *   const r1 = tree.addRoot({ role: 'system', content: 'You are helpful.' });
 *   const m1 = tree.append({ role: 'user', content: 'Hello' });
 *   const m2 = tree.append({ role: 'assistant', content: 'Hi there!' });
 *
 *   // Branch from m1 with a different user message
 *   const alt = tree.branch(r1, { role: 'user', content: 'Hey!' });
 *
 *   // tree.activePath(), tree.size(), etc. are reactive accessors
 *   return (
 *     <div>
 *       <p>Tree size: {tree.size()}</p>
 *       <For each={tree.activePath().messages}>
 *         {(msg) => <div>{msg.role}: {msg.content}</div>}
 *       </For>
 *     </div>
 *   );
 * }
 * ```
 */
export class ReactiveMessageTree<M> {
	/** The underlying non-reactive MessageTree. */
	readonly inner: MessageTree<M>;

	private _getVersion: Accessor<number>;
	private _setVersion: (v: number | ((prev: number) => number)) => void;

	// ─── Reactive Accessors ──────────────────────────────────────

	/** Total number of nodes in the tree. Reactive accessor. */
	readonly size: Accessor<number>;

	/** Whether the tree is empty. Reactive accessor. */
	readonly isEmpty: Accessor<boolean>;

	/** The active leaf node ID, or null if the tree is empty. Reactive accessor. */
	readonly activeLeafId: Accessor<string | null>;

	/** The IDs of all root nodes. Reactive accessor. */
	readonly rootIds: Accessor<readonly string[]>;

	/** The active path from root to the active leaf. Reactive accessor. */
	readonly activePath: Accessor<TreePath<M>>;

	constructor(config?: TreeConfig) {
		this.inner = new MessageTree<M>(config);

		const [getVersion, setVersion] = createSignal(0);
		this._getVersion = getVersion;
		this._setVersion = setVersion;

		this.size = createMemo(() => {
			getVersion();
			return this.inner.size;
		});
		this.isEmpty = createMemo(() => {
			getVersion();
			return this.inner.isEmpty;
		});
		this.activeLeafId = createMemo(() => {
			getVersion();
			return this.inner.activeLeafId;
		});
		this.rootIds = createMemo(() => {
			getVersion();
			return this.inner.rootIds;
		});
		this.activePath = createMemo(() => {
			getVersion();
			return this.inner.getActivePath();
		});
	}

	// ─── Mutations (trigger reactivity) ─────────────────────────

	/**
	 * Append a message to the active path.
	 * If the tree is empty, creates a root node.
	 * Otherwise, adds as child of the active leaf.
	 * Updates active leaf to the new node.
	 * @returns The new node's ID.
	 */
	append(message: M, metadata?: Record<string, unknown>): string {
		const id = this.inner.append(message, metadata);
		this._setVersion((v) => v + 1);
		return id;
	}

	/**
	 * Add a message as child of a specific parent.
	 * Does NOT update active leaf.
	 * @throws If parentId does not exist.
	 * @returns The new node's ID.
	 */
	addChild(parentId: string, message: M, metadata?: Record<string, unknown>): string {
		const id = this.inner.addChild(parentId, message, metadata);
		this._setVersion((v) => v + 1);
		return id;
	}

	/**
	 * Add a root-level node. Sets it as active leaf.
	 * @returns The new node's ID.
	 */
	addRoot(message: M, metadata?: Record<string, unknown>): string {
		const id = this.inner.addRoot(message, metadata);
		this._setVersion((v) => v + 1);
		return id;
	}

	/**
	 * Branch from a parent: add a new child and set it as active leaf.
	 * Used for edit-message and regenerate-response workflows.
	 * @throws If parentId does not exist.
	 * @returns The new node's ID.
	 */
	branch(parentId: string, message: M, metadata?: Record<string, unknown>): string {
		const id = this.inner.branch(parentId, message, metadata);
		this._setVersion((v) => v + 1);
		return id;
	}

	/**
	 * Set the active leaf to a specific node.
	 * @throws If nodeId does not exist.
	 */
	setActiveLeaf(nodeId: string): void {
		this.inner.setActiveLeaf(nodeId);
		this._setVersion((v) => v + 1);
	}

	/**
	 * Navigate to the next sibling (right).
	 * Follows first-child chain to leaf and sets it as active.
	 * @returns New active leaf ID, or null if already at last sibling.
	 */
	nextSibling(nodeId: string): string | null {
		const id = this.inner.nextSibling(nodeId);
		this._setVersion((v) => v + 1);
		return id;
	}

	/**
	 * Navigate to the previous sibling (left).
	 * Follows first-child chain to leaf and sets it as active.
	 * @returns New active leaf ID, or null if already at first sibling.
	 */
	prevSibling(nodeId: string): string | null {
		const id = this.inner.prevSibling(nodeId);
		this._setVersion((v) => v + 1);
		return id;
	}

	/**
	 * Remove a subtree rooted at nodeId.
	 * If the active leaf is in the removed subtree, resets accordingly.
	 * @throws If nodeId does not exist.
	 */
	remove(nodeId: string): void {
		this.inner.remove(nodeId);
		this._setVersion((v) => v + 1);
	}

	// ─── Query Methods (delegate directly) ──────────────────────

	/** Get the path from root to a specific node. */
	getPathTo(nodeId: string): TreePath<M> {
		return this.inner.getPathTo(nodeId);
	}

	/** Get a node by ID. Returns undefined if not found. */
	get(id: string): TreeNode<M> | undefined {
		return this.inner.get(id);
	}

	/** Check whether a node exists. */
	has(id: string): boolean {
		return this.inner.has(id);
	}

	/** Get the siblings of a node and its index among them. */
	getSiblings(nodeId: string): { siblings: readonly TreeNode<M>[]; index: number } {
		return this.inner.getSiblings(nodeId);
	}

	/** Get the depth of a node (distance from root). Root nodes have depth 0. */
	depth(nodeId: string): number {
		return this.inner.depth(nodeId);
	}

	/** Get all leaf nodes in the tree. */
	getLeaves(): TreeNode<M>[] {
		return this.inner.getLeaves();
	}

	// ─── Serialization ──────────────────────────────────────────

	/** Serialize the tree to a plain object. */
	serialize(): SerializedTree<M> {
		return this.inner.serialize();
	}

	/** Restore a ReactiveMessageTree from serialized data. */
	static deserialize<M>(data: SerializedTree<M>, config?: TreeConfig): ReactiveMessageTree<M> {
		const instance = new ReactiveMessageTree<M>(config);
		const restored = MessageTree.deserialize<M>(data, config);
		(instance as { inner: MessageTree<M> }).inner = restored;
		// Bump version so memos re-evaluate with the restored inner tree
		instance._setVersion((v) => v + 1);
		return instance;
	}
}
