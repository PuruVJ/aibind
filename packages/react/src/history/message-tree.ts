import { useSyncExternalStore } from "react";
import {
  MessageTree as CoreMessageTree,
  type TreeConfig,
  type TreeNode,
  type TreePath,
  type SerializedTree,
} from "@aibind/core";

/**
 * React reactive wrapper around {@link CoreMessageTree}.
 *
 * All mutations automatically trigger re-renders via `useSyncExternalStore`.
 * Call `useSnapshot()` inside a component to get reactive state.
 *
 * @example
 * ```tsx
 * const tree = new MessageTree<{ role: string; content: string }>();
 *
 * function TreeView() {
 *   const { activePath, size } = tree.useSnapshot();
 *
 *   return (
 *     <div>
 *       <p>Tree size: {size}</p>
 *       {activePath.messages.map((msg, i) => (
 *         <div key={activePath.nodeIds[i]}>
 *           {msg.role}: {msg.content}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export class MessageTree<M> {
  /** The underlying non-reactive MessageTree. */
  readonly inner: CoreMessageTree<M>;

  private _version = 0;
  private _listeners = new Set<() => void>();

  constructor(config?: TreeConfig) {
    this.inner = new CoreMessageTree<M>(config);
  }

  private _notify(): void {
    this._version++;
    this._listeners.forEach((l) => l());
  }

  /** Subscribe to changes (for useSyncExternalStore). */
  readonly subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  };

  /** Get the current snapshot version (for useSyncExternalStore). */
  readonly getSnapshot = (): number => this._version;

  // ─── React Hook ────────────────────────────────────────────

  /**
   * React hook — call inside components to get reactive state.
   * Re-renders the component when the tree changes.
   */
  useSnapshot(): {
    size: number;
    isEmpty: boolean;
    activeLeafId: string | null;
    rootIds: readonly string[];
    activePath: TreePath<M>;
  } {
    useSyncExternalStore(this.subscribe, this.getSnapshot);
    return {
      size: this.inner.size,
      isEmpty: this.inner.isEmpty,
      activeLeafId: this.inner.activeLeafId,
      rootIds: this.inner.rootIds,
      activePath: this.inner.getActivePath(),
    };
  }

  // ─── Mutations (trigger reactivity) ─────────────────────────

  /** Append a message to the active path. */
  append(message: M, metadata?: Record<string, unknown>): string {
    const id = this.inner.append(message, metadata);
    this._notify();
    return id;
  }

  /** Add a message as child of a specific parent. */
  addChild(
    parentId: string,
    message: M,
    metadata?: Record<string, unknown>,
  ): string {
    const id = this.inner.addChild(parentId, message, metadata);
    this._notify();
    return id;
  }

  /** Add a root-level node. Sets it as active leaf. */
  addRoot(message: M, metadata?: Record<string, unknown>): string {
    const id = this.inner.addRoot(message, metadata);
    this._notify();
    return id;
  }

  /** Branch from a parent: add a new child and set it as active leaf. */
  branch(
    parentId: string,
    message: M,
    metadata?: Record<string, unknown>,
  ): string {
    const id = this.inner.branch(parentId, message, metadata);
    this._notify();
    return id;
  }

  /** Set the active leaf to a specific node. */
  setActiveLeaf(nodeId: string): void {
    this.inner.setActiveLeaf(nodeId);
    this._notify();
  }

  /** Navigate to the next sibling (right). */
  nextSibling(nodeId: string): string | null {
    const id = this.inner.nextSibling(nodeId);
    this._notify();
    return id;
  }

  /** Navigate to the previous sibling (left). */
  prevSibling(nodeId: string): string | null {
    const id = this.inner.prevSibling(nodeId);
    this._notify();
    return id;
  }

  /** Remove a subtree rooted at nodeId. */
  remove(nodeId: string): void {
    this.inner.remove(nodeId);
    this._notify();
  }

  // ─── Query Methods (delegate directly) ──────────────────────

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

  /** Get the depth of a node. */
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
    instance._version++;
    return instance;
  }
}
