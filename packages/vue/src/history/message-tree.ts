import { ref, computed, type ComputedRef } from "vue";
import {
  MessageTree as CoreMessageTree,
  type TreeConfig,
  type TreeNode,
  type TreePath,
  type SerializedTree,
} from "@aibind/core";

/**
 * Vue 3 reactive wrapper around `MessageTree` from `@aibind/core`.
 *
 * Exposes all `MessageTree` operations while making key getters reactive
 * via Vue's `ref` and `computed`. Mutations bump an internal version counter
 * so that any `computed` that reads from the wrapper automatically re-evaluates.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { MessageTree } from '@aibind/vue/history';
 *
 * interface Msg { role: string; content: string }
 * const tree = new MessageTree<Msg>();
 *
 * tree.append({ role: 'user', content: 'Hello' });
 * tree.append({ role: 'assistant', content: 'Hi!' });
 *
 * // Reactive -- updates automatically in templates
 * console.log(tree.activePath.value.messages);
 * </script>
 *
 * <template>
 *   <p>Tree has {{ tree.size.value }} nodes</p>
 *   <div v-for="msg in tree.activePath.value.messages">
 *     {{ msg.role }}: {{ msg.content }}
 *   </div>
 * </template>
 * ```
 *
 * @typeParam M - The message type stored in the tree.
 */
export class MessageTree<M> {
  /** The underlying non-reactive `MessageTree` instance. */
  readonly inner: CoreMessageTree<M>;

  /**
   * Internal version counter. Bumped on every mutation so that
   * Vue `computed` refs that depend on it re-evaluate.
   */
  private _version = ref(0);

  // ─── Reactive getters ──────────────────────────────────────

  /** Reactive total number of nodes in the tree. */
  readonly size: ComputedRef<number>;

  /** Reactive flag indicating whether the tree has any nodes. */
  readonly isEmpty: ComputedRef<boolean>;

  /** Reactive ID of the currently active leaf node, or null. */
  readonly activeLeafId: ComputedRef<string | null>;

  /** Reactive IDs of root-level nodes. */
  readonly rootIds: ComputedRef<readonly string[]>;

  /** Reactive linear message path from root to the active leaf. */
  readonly activePath: ComputedRef<TreePath<M>>;

  constructor(config?: TreeConfig) {
    this.inner = new CoreMessageTree<M>(config);

    this.size = computed(() => {
      this._version.value;
      return this.inner.size;
    });

    this.isEmpty = computed(() => {
      this._version.value;
      return this.inner.isEmpty;
    });

    this.activeLeafId = computed(() => {
      this._version.value;
      return this.inner.activeLeafId;
    });

    this.rootIds = computed(() => {
      this._version.value;
      return this.inner.rootIds;
    });

    this.activePath = computed(() => {
      this._version.value;
      return this.inner.getActivePath();
    });
  }

  // ─── Mutations (bump version) ──────────────────────────────

  /**
   * Append a message to the active path.
   * If tree is empty, creates a root node.
   * Otherwise, adds as child of the active leaf.
   * Updates active leaf to the new node.
   * @returns The new node's ID.
   */
  append(message: M, metadata?: Record<string, unknown>): string {
    const id = this.inner.append(message, metadata);
    this._version.value++;
    return id;
  }

  /**
   * Add a message as child of a specific parent.
   * Does NOT update active leaf.
   * @throws If parentId does not exist.
   * @returns The new node's ID.
   */
  addChild(
    parentId: string,
    message: M,
    metadata?: Record<string, unknown>,
  ): string {
    const id = this.inner.addChild(parentId, message, metadata);
    this._version.value++;
    return id;
  }

  /**
   * Add a root-level node. Sets it as active leaf.
   * @returns The new node's ID.
   */
  addRoot(message: M, metadata?: Record<string, unknown>): string {
    const id = this.inner.addRoot(message, metadata);
    this._version.value++;
    return id;
  }

  /**
   * Branch from a parent: add a new child and set it as active leaf.
   * Used for edit-message and regenerate-response workflows.
   * @throws If parentId does not exist.
   * @returns The new node's ID.
   */
  branch(
    parentId: string,
    message: M,
    metadata?: Record<string, unknown>,
  ): string {
    const id = this.inner.branch(parentId, message, metadata);
    this._version.value++;
    return id;
  }

  /**
   * Set the active leaf to a specific node.
   * @throws If nodeId does not exist.
   */
  setActiveLeaf(nodeId: string): void {
    this.inner.setActiveLeaf(nodeId);
    this._version.value++;
  }

  /**
   * Navigate to the next sibling (right).
   * Follows first-child chain to leaf and sets it as active.
   * @returns New active leaf ID, or null if already at last sibling.
   */
  nextSibling(nodeId: string): string | null {
    const result = this.inner.nextSibling(nodeId);
    this._version.value++;
    return result;
  }

  /**
   * Navigate to the previous sibling (left).
   * Follows first-child chain to leaf and sets it as active.
   * @returns New active leaf ID, or null if already at first sibling.
   */
  prevSibling(nodeId: string): string | null {
    const result = this.inner.prevSibling(nodeId);
    this._version.value++;
    return result;
  }

  /**
   * Remove a subtree rooted at nodeId.
   * If the active leaf is in the removed subtree, resets to
   * the parent's last remaining child chain, or null.
   * @throws If nodeId does not exist.
   */
  remove(nodeId: string): void {
    this.inner.remove(nodeId);
    this._version.value++;
  }

  // ─── Query methods (delegate directly) ─────────────────────

  /**
   * Extract the linear message path from root to any node.
   * @throws If nodeId does not exist.
   */
  getPathTo(nodeId: string): TreePath<M> {
    return this.inner.getPathTo(nodeId);
  }

  /**
   * Get a node by ID. Returns undefined if not found.
   */
  get(id: string): TreeNode<M> | undefined {
    return this.inner.get(id);
  }

  /**
   * Check if a node exists.
   */
  has(id: string): boolean {
    return this.inner.has(id);
  }

  /**
   * Get siblings of a node (all children of its parent, including itself).
   * For root nodes, returns all root-level nodes.
   */
  getSiblings(nodeId: string): {
    siblings: readonly TreeNode<M>[];
    index: number;
  } {
    return this.inner.getSiblings(nodeId);
  }

  /**
   * Get the depth of a node (distance from root). Root nodes have depth 0.
   */
  depth(nodeId: string): number {
    return this.inner.depth(nodeId);
  }

  /**
   * Get all leaf nodes (nodes with no children).
   */
  getLeaves(): TreeNode<M>[] {
    return this.inner.getLeaves();
  }

  // ─── Serialization ─────────────────────────────────────────

  /**
   * Serialize the tree to a plain object.
   */
  serialize(): SerializedTree<M> {
    return this.inner.serialize();
  }

  /**
   * Restore a `MessageTree` from serialized data.
   * The returned instance has fully reactive computed properties.
   *
   * @param data - Serialized tree data previously produced by `serialize()`.
   * @param config - Optional tree configuration (e.g. custom ID generator).
   */
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
