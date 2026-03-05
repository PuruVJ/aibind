import {
  MessageTree as CoreMessageTree,
  type TreeConfig,
  type TreeNode,
  type TreePath,
  type SerializedTree,
} from "@aibind/core";

/**
 * Svelte 5 reactive wrapper around MessageTree.
 *
 * All mutations automatically trigger reactive updates.
 * Access the underlying `MessageTree` via the `inner` property for
 * non-reactive operations or direct tree access.
 *
 * @example
 * ```svelte
 * <script>
 *   import { MessageTree } from '@aibind/svelte/history';
 *
 *   const tree = new MessageTree();
 *   const r1 = tree.addRoot({ role: 'system', content: 'You are helpful.' });
 *   const m1 = tree.addChild(r1, { role: 'user', content: 'Hello' });
 *   const m2 = tree.addChild(m1, { role: 'assistant', content: 'Hi there!' });
 *
 *   // Branch from m1 with a different user message
 *   const alt = tree.branch(m1, { role: 'user', content: 'Hey!' });
 *
 *   // tree.activePath, tree.size, etc. are reactive — UI updates automatically
 * </script>
 *
 * <p>Tree size: {tree.size}</p>
 *
 * {#each tree.activePath.messages as msg}
 *   <div>{msg.role}: {msg.content}</div>
 * {/each}
 * ```
 */
export class MessageTree<M> {
  /** The underlying non-reactive MessageTree. */
  readonly inner: CoreMessageTree<M>;

  /** Reactivity trigger — bumped on every mutation. */
  #version = $state(0);

  // ─── Reactive Getters ──────────────────────────────────────

  /** Total number of nodes in the tree. Reactive. */
  size: number = $derived.by(() => {
    this.#version;
    return this.inner.size;
  });

  /** Whether the tree is empty. Reactive. */
  isEmpty: boolean = $derived.by(() => {
    this.#version;
    return this.inner.isEmpty;
  });

  /** The active leaf node ID, or null if the tree is empty. Reactive. */
  activeLeafId: string | null = $derived.by(() => {
    this.#version;
    return this.inner.activeLeafId;
  });

  /** The IDs of all root nodes. Reactive. */
  rootIds: readonly string[] = $derived.by(() => {
    this.#version;
    return this.inner.rootIds;
  });

  /** The active path from root to the active leaf. Reactive. */
  activePath: TreePath<M> = $derived.by(() => {
    this.#version;
    return this.inner.getActivePath();
  });

  constructor(config?: TreeConfig) {
    this.inner = new CoreMessageTree<M>(config);
  }

  // ─── Mutations (trigger reactivity) ─────────────────────────

  /** Append a message as a child of the current active leaf. */
  append(message: M, metadata?: Record<string, unknown>): string {
    const id = this.inner.append(message, metadata);
    this.#version++;
    return id;
  }

  /** Add a child to a specific parent node. */
  addChild(
    parentId: string,
    message: M,
    metadata?: Record<string, unknown>,
  ): string {
    const id = this.inner.addChild(parentId, message, metadata);
    this.#version++;
    return id;
  }

  /** Add a new root node. */
  addRoot(message: M, metadata?: Record<string, unknown>): string {
    const id = this.inner.addRoot(message, metadata);
    this.#version++;
    return id;
  }

  /** Branch from a parent node — creates a sibling subtree. */
  branch(
    parentId: string,
    message: M,
    metadata?: Record<string, unknown>,
  ): string {
    const id = this.inner.branch(parentId, message, metadata);
    this.#version++;
    return id;
  }

  /** Set the active leaf node, updating the active path. */
  setActiveLeaf(nodeId: string): void {
    this.inner.setActiveLeaf(nodeId);
    this.#version++;
  }

  /** Navigate to the next sibling of a node. */
  nextSibling(nodeId: string): string | null {
    const id = this.inner.nextSibling(nodeId);
    this.#version++;
    return id;
  }

  /** Navigate to the previous sibling of a node. */
  prevSibling(nodeId: string): string | null {
    const id = this.inner.prevSibling(nodeId);
    this.#version++;
    return id;
  }

  /** Remove a node and its descendants from the tree. */
  remove(nodeId: string): void {
    this.inner.remove(nodeId);
    this.#version++;
  }

  // ─── Query Methods ──────────────────────────────────────────

  /** Get the path from root to a specific node. */
  getPathTo(nodeId: string): TreePath<M> {
    return this.inner.getPathTo(nodeId);
  }

  /** Get a node by ID. */
  get(id: string): TreeNode<M> | undefined {
    return this.inner.get(id);
  }

  /** Check whether a node exists. */
  has(id: string): boolean {
    return this.inner.has(id);
  }

  /** Get the siblings of a node and its index among them. */
  getSiblings(nodeId: string): {
    siblings: readonly TreeNode<M>[];
    index: number;
  } {
    return this.inner.getSiblings(nodeId);
  }

  /** Get the depth of a node (distance from root). */
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

  /** Restore a MessageTree from serialized data. */
  static deserialize<M>(
    data: SerializedTree<M>,
    config?: TreeConfig,
  ): MessageTree<M> {
    const instance = new MessageTree<M>(config);
    const restored = CoreMessageTree.deserialize<M>(data, config);
    (instance as { inner: CoreMessageTree<M> }).inner = restored;
    return instance;
  }
}
