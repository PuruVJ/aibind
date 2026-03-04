/**
 * A single node in the conversation tree.
 * Nodes are immutable once created — edits produce new sibling branches.
 * Generic over `M` so any message shape can be stored.
 */
export interface TreeNode<M> {
  /** Unique identifier for this node. */
  readonly id: string;
  /** The message payload. */
  readonly message: M;
  /** ID of the parent node, or null for root-level nodes. */
  readonly parentId: string | null;
  /** Ordered list of child node IDs. First child is the default branch. */
  readonly children: readonly string[];
  /** Arbitrary metadata (model config, system prompt overrides, etc.). */
  readonly metadata: Readonly<Record<string, unknown>>;
  /** ISO-8601 timestamp of when this node was created. */
  readonly createdAt: string;
}

/**
 * Configuration for creating a MessageTree.
 */
export interface TreeConfig {
  /** Function to generate unique IDs. Defaults to crypto.randomUUID(). */
  generateId?: () => string;
}

/**
 * Serialized form of the entire tree, suitable for JSON persistence.
 */
export interface SerializedTree<M> {
  /** Format version for future migration support. */
  version: 1;
  /** All nodes keyed by ID. */
  nodes: Record<string, TreeNode<M>>;
  /** IDs of root-level nodes. */
  rootIds: string[];
  /** The currently active leaf node ID, or null if tree is empty. */
  activeLeafId: string | null;
}

/**
 * Linear message path from root to a given node.
 */
export interface TreePath<M> {
  /** Ordered messages from root to the target node. */
  messages: M[];
  /** Ordered node IDs corresponding to each message. */
  nodeIds: string[];
}

/**
 * Low-level tree data structure for conversation history with branching.
 *
 * Supports parent-pointer traversal (root → leaf paths), children arrays
 * (sibling navigation), and an active-leaf cursor for tracking the
 * "current conversation."
 *
 * @example
 * ```ts
 * const tree = new MessageTree<{ role: string; content: string }>();
 * tree.append({ role: 'user', content: 'Hello' });
 * tree.append({ role: 'assistant', content: 'Hi!' });
 * tree.getActivePath().messages;
 * // [{ role: 'user', content: 'Hello' }, { role: 'assistant', content: 'Hi!' }]
 * ```
 */
export class MessageTree<M> {
  #nodes: Map<string, TreeNode<M>>;
  #rootIds: string[];
  #activeLeafId: string | null;
  #generateId: () => string;

  constructor(config?: TreeConfig) {
    this.#nodes = new Map();
    this.#rootIds = [];
    this.#activeLeafId = null;
    this.#generateId = config?.generateId ?? (() => crypto.randomUUID());
  }

  // ─── Queries ────────────────────────────────────────────────

  /** Total number of nodes in the tree. */
  get size(): number {
    return this.#nodes.size;
  }

  /** Whether the tree has any nodes. */
  get isEmpty(): boolean {
    return this.#nodes.size === 0;
  }

  /** The ID of the currently active leaf node, or null. */
  get activeLeafId(): string | null {
    return this.#activeLeafId;
  }

  /** IDs of root-level nodes. */
  get rootIds(): readonly string[] {
    return this.#rootIds;
  }

  /** Get a node by ID. Returns undefined if not found. */
  get(id: string): TreeNode<M> | undefined {
    return this.#nodes.get(id);
  }

  /** Check if a node exists. */
  has(id: string): boolean {
    return this.#nodes.has(id);
  }

  // ─── Active Path ────────────────────────────────────────────

  /**
   * Extract the linear message path from root to the active leaf.
   * Returns empty path if tree is empty.
   */
  getActivePath(): TreePath<M> {
    if (this.#activeLeafId === null) {
      return { messages: [], nodeIds: [] };
    }
    return this.getPathTo(this.#activeLeafId);
  }

  /**
   * Extract the linear message path from root to any node.
   * @throws If nodeId does not exist.
   */
  getPathTo(nodeId: string): TreePath<M> {
    const ids = this.#pathToRoot(nodeId);
    const messages: M[] = [];
    for (let i = 0; i < ids.length; i++) {
      messages.push(this.#nodes.get(ids[i])!.message);
    }
    return { messages, nodeIds: ids };
  }

  // ─── Mutations ──────────────────────────────────────────────

  /**
   * Append a message to the active path.
   * If tree is empty, creates a root node.
   * Otherwise, adds as child of the active leaf.
   * Updates active leaf to the new node.
   * @returns The new node's ID.
   */
  append(message: M, metadata?: Record<string, unknown>): string {
    if (this.#activeLeafId === null) {
      return this.addRoot(message, metadata);
    }
    const node = this.#createNode(message, this.#activeLeafId, metadata);
    this.#addChildToParent(this.#activeLeafId, node.id);
    this.#activeLeafId = node.id;
    return node.id;
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
    if (!this.#nodes.has(parentId)) {
      throw new Error(`MessageTree: node "${parentId}" does not exist`);
    }
    const node = this.#createNode(message, parentId, metadata);
    this.#addChildToParent(parentId, node.id);
    return node.id;
  }

  /**
   * Add a root-level node. Sets it as active leaf.
   * @returns The new node's ID.
   */
  addRoot(message: M, metadata?: Record<string, unknown>): string {
    const node = this.#createNode(message, null, metadata);
    this.#rootIds.push(node.id);
    this.#activeLeafId = node.id;
    return node.id;
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
    const id = this.addChild(parentId, message, metadata);
    this.#activeLeafId = id;
    return id;
  }

  // ─── Navigation ─────────────────────────────────────────────

  /**
   * Set the active leaf to a specific node.
   * @throws If nodeId does not exist.
   */
  setActiveLeaf(nodeId: string): void {
    if (!this.#nodes.has(nodeId)) {
      throw new Error(`MessageTree: node "${nodeId}" does not exist`);
    }
    this.#activeLeafId = nodeId;
  }

  /**
   * Get siblings of a node (all children of its parent, including itself).
   * For root nodes, returns all root-level nodes.
   */
  getSiblings(nodeId: string): {
    siblings: readonly TreeNode<M>[];
    index: number;
  } {
    const node = this.#nodes.get(nodeId);
    if (!node) {
      throw new Error(`MessageTree: node "${nodeId}" does not exist`);
    }

    let siblingIds: readonly string[];
    if (node.parentId === null) {
      siblingIds = this.#rootIds;
    } else {
      const parent = this.#nodes.get(node.parentId)!;
      siblingIds = parent.children;
    }

    const siblings: TreeNode<M>[] = [];
    let index = -1;
    for (let i = 0; i < siblingIds.length; i++) {
      const sib = this.#nodes.get(siblingIds[i])!;
      siblings.push(sib);
      if (siblingIds[i] === nodeId) index = i;
    }
    return { siblings, index };
  }

  /**
   * Navigate to the next sibling (right).
   * Follows first-child chain to leaf and sets it as active.
   * @returns New active leaf ID, or null if already at last sibling.
   */
  nextSibling(nodeId: string): string | null {
    const { siblings, index } = this.#getSiblingIds(nodeId);
    if (index >= siblings.length - 1) return null;
    const nextId = siblings[index + 1];
    const leaf = this.#followFirstChildToLeaf(nextId);
    this.#activeLeafId = leaf;
    return leaf;
  }

  /**
   * Navigate to the previous sibling (left).
   * Follows first-child chain to leaf and sets it as active.
   * @returns New active leaf ID, or null if already at first sibling.
   */
  prevSibling(nodeId: string): string | null {
    const { siblings, index } = this.#getSiblingIds(nodeId);
    if (index <= 0) return null;
    const prevId = siblings[index - 1];
    const leaf = this.#followFirstChildToLeaf(prevId);
    this.#activeLeafId = leaf;
    return leaf;
  }

  // ─── Serialization ──────────────────────────────────────────

  /** Serialize the tree to a plain object. */
  serialize(): SerializedTree<M> {
    const nodes: Record<string, TreeNode<M>> = {};
    for (const [id, node] of this.#nodes) {
      nodes[id] = node;
    }
    return {
      version: 1,
      nodes,
      rootIds: [...this.#rootIds],
      activeLeafId: this.#activeLeafId,
    };
  }

  /**
   * Restore a tree from serialized data.
   * @throws If data is malformed (broken refs, cycles).
   */
  static deserialize<M>(
    data: SerializedTree<M>,
    config?: TreeConfig,
  ): MessageTree<M> {
    if (data.version !== 1) {
      throw new Error(`MessageTree: unsupported version ${data.version}`);
    }

    const tree = new MessageTree<M>(config);
    const nodeEntries = Object.entries(data.nodes);

    // Load all nodes
    for (const [id, node] of nodeEntries) {
      tree.#nodes.set(id, node);
    }

    // Validate parent references and children consistency
    for (const [id, node] of nodeEntries) {
      if (node.parentId !== null && !tree.#nodes.has(node.parentId)) {
        throw new Error(
          `MessageTree: node "${id}" references missing parent "${node.parentId}"`,
        );
      }
      for (const childId of node.children) {
        if (!tree.#nodes.has(childId)) {
          throw new Error(
            `MessageTree: node "${id}" references missing child "${childId}"`,
          );
        }
        const child = tree.#nodes.get(childId)!;
        if (child.parentId !== id) {
          throw new Error(
            `MessageTree: child "${childId}" parentId does not match parent "${id}"`,
          );
        }
      }
    }

    // Validate rootIds
    for (const rootId of data.rootIds) {
      if (!tree.#nodes.has(rootId)) {
        throw new Error(
          `MessageTree: rootIds references missing node "${rootId}"`,
        );
      }
      const root = tree.#nodes.get(rootId)!;
      if (root.parentId !== null) {
        throw new Error(`MessageTree: root node "${rootId}" has a parentId`);
      }
    }

    // Validate no cycles via DFS
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const checkCycle = (id: string) => {
      if (visiting.has(id)) {
        throw new Error(`MessageTree: cycle detected at node "${id}"`);
      }
      if (visited.has(id)) return;
      visiting.add(id);
      const node = tree.#nodes.get(id)!;
      for (const childId of node.children) {
        checkCycle(childId);
      }
      visiting.delete(id);
      visited.add(id);
    };

    for (const rootId of data.rootIds) {
      checkCycle(rootId);
    }

    tree.#rootIds = [...data.rootIds];
    if (data.activeLeafId !== null && !tree.#nodes.has(data.activeLeafId)) {
      throw new Error(
        `MessageTree: activeLeafId "${data.activeLeafId}" does not exist`,
      );
    }
    tree.#activeLeafId = data.activeLeafId;

    return tree;
  }

  // ─── Utility ────────────────────────────────────────────────

  /** Get the depth of a node (distance from root). Root nodes have depth 0. */
  depth(nodeId: string): number {
    let d = 0;
    let current: string | null = nodeId;
    while (current !== null) {
      const node = this.#nodes.get(current);
      if (!node) {
        throw new Error(`MessageTree: node "${nodeId}" does not exist`);
      }
      current = node.parentId;
      if (current !== null) d++;
    }
    return d;
  }

  /** Get all leaf nodes (nodes with no children). */
  getLeaves(): TreeNode<M>[] {
    const leaves: TreeNode<M>[] = [];
    for (const node of this.#nodes.values()) {
      if (node.children.length === 0) leaves.push(node);
    }
    return leaves;
  }

  /**
   * Remove a subtree rooted at nodeId.
   * If the active leaf is in the removed subtree, resets to
   * the parent's last remaining child chain, or null.
   * @throws If nodeId does not exist.
   */
  remove(nodeId: string): void {
    const node = this.#nodes.get(nodeId);
    if (!node) {
      throw new Error(`MessageTree: node "${nodeId}" does not exist`);
    }

    // Collect all descendant IDs
    const toRemove = new Set<string>();
    const queue = [nodeId];
    while (queue.length > 0) {
      const id = queue.pop()!;
      toRemove.add(id);
      const n = this.#nodes.get(id);
      if (n) {
        for (const childId of n.children) {
          queue.push(childId);
        }
      }
    }

    // Remove from parent's children
    if (node.parentId !== null) {
      const parent = this.#nodes.get(node.parentId)!;
      const children = parent.children.filter((id) => id !== nodeId);
      (parent as unknown as { children: string[] }).children = children;
    } else {
      this.#rootIds = this.#rootIds.filter((id) => id !== nodeId);
    }

    // Delete all nodes
    for (const id of toRemove) {
      this.#nodes.delete(id);
    }

    // Fix active leaf if it was in the removed subtree
    if (this.#activeLeafId !== null && toRemove.has(this.#activeLeafId)) {
      if (node.parentId !== null) {
        const parent = this.#nodes.get(node.parentId)!;
        if (parent.children.length > 0) {
          this.#activeLeafId = this.#followFirstChildToLeaf(
            parent.children[parent.children.length - 1],
          );
        } else {
          this.#activeLeafId = node.parentId;
        }
      } else if (this.#rootIds.length > 0) {
        this.#activeLeafId = this.#followFirstChildToLeaf(
          this.#rootIds[this.#rootIds.length - 1],
        );
      } else {
        this.#activeLeafId = null;
      }
    }
  }

  // ─── Internal ───────────────────────────────────────────────

  #createNode(
    message: M,
    parentId: string | null,
    metadata?: Record<string, unknown>,
  ): TreeNode<M> {
    const node: TreeNode<M> = {
      id: this.#generateId(),
      message: Object.freeze(structuredClone(message)) as M,
      parentId,
      children: [],
      metadata: Object.freeze({ ...metadata }) as Readonly<
        Record<string, unknown>
      >,
      createdAt: new Date().toISOString(),
    };
    this.#nodes.set(node.id, node);
    return node;
  }

  #addChildToParent(parentId: string, childId: string): void {
    const parent = this.#nodes.get(parentId)!;
    (parent.children as string[]).push(childId);
  }

  /** Walk from nodeId to root, return IDs in root-to-leaf order. */
  #pathToRoot(nodeId: string): string[] {
    const path: string[] = [];
    let current: string | null = nodeId;
    while (current !== null) {
      const node = this.#nodes.get(current);
      if (!node) {
        throw new Error(`MessageTree: node "${nodeId}" does not exist`);
      }
      path.push(current);
      current = node.parentId;
    }
    path.reverse();
    return path;
  }

  /** Follow first child until reaching a leaf. */
  #followFirstChildToLeaf(nodeId: string): string {
    let current = nodeId;
    while (true) {
      const node = this.#nodes.get(current)!;
      if (node.children.length === 0) return current;
      current = node.children[0] as string;
    }
  }

  /** Get sibling IDs and index for a node. */
  #getSiblingIds(nodeId: string): {
    siblings: readonly string[];
    index: number;
  } {
    const node = this.#nodes.get(nodeId);
    if (!node) {
      throw new Error(`MessageTree: node "${nodeId}" does not exist`);
    }

    const siblingIds =
      node.parentId === null
        ? this.#rootIds
        : this.#nodes.get(node.parentId)!.children;

    const index = siblingIds.indexOf(nodeId);
    return { siblings: siblingIds, index };
  }
}
