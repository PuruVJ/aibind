import { MessageTree, type TreeConfig } from "./message-tree";

/**
 * High-level conversation history with branching support.
 *
 * Wraps `MessageTree` with a simpler API focused on common chat operations:
 * append messages, edit previous messages (creating branches), regenerate
 * responses, and navigate between alternatives.
 *
 * For advanced tree operations, access the underlying `tree` property directly.
 *
 * @example
 * ```ts
 * const chat = new ChatHistory<{ role: string; content: string }>();
 *
 * const m1 = chat.append({ role: 'user', content: 'Hello' });
 * const m2 = chat.append({ role: 'assistant', content: 'Hi!' });
 *
 * // Edit creates a branch
 * const m1b = chat.edit(m1, { role: 'user', content: 'Hey there' });
 * chat.messages; // [{ role: 'user', content: 'Hey there' }]
 *
 * // Navigate between alternatives
 * chat.prevAlternative(m1b); // back to original branch
 * chat.messages; // [{ role: 'user', content: 'Hello' }, { role: 'assistant', content: 'Hi!' }]
 * ```
 */
export class ChatHistory<M> {
  /** The underlying tree data structure. Access for advanced operations. */
  readonly tree: MessageTree<M>;

  constructor(config?: TreeConfig) {
    this.tree = new MessageTree<M>(config);
  }

  // ─── Current Conversation ───────────────────────────────────

  /** Linear message path from root to the active leaf. */
  get messages(): M[] {
    return this.tree.getActivePath().messages;
  }

  /** Node IDs corresponding to each message in the active path. */
  get nodeIds(): string[] {
    return this.tree.getActivePath().nodeIds;
  }

  /** Whether the history has any messages. */
  get isEmpty(): boolean {
    return this.tree.isEmpty;
  }

  /** Total number of messages across all branches. */
  get size(): number {
    return this.tree.size;
  }

  // ─── Simple Operations ──────────────────────────────────────

  /**
   * Append a message to the current conversation path.
   * @returns The new node's ID.
   */
  append(message: M): string {
    return this.tree.append(message);
  }

  /**
   * Edit a message by creating a new branch from its parent.
   * The edited message becomes a sibling of the original.
   * Sets the new branch as active.
   *
   * @param messageId - ID of the message to "edit" (a sibling will be created).
   * @param newMessage - The replacement message content.
   * @returns The new node's ID.
   * @throws If messageId does not exist.
   */
  edit(messageId: string, newMessage: M): string {
    const node = this.tree.get(messageId);
    if (!node) {
      throw new Error(`ChatHistory: message "${messageId}" does not exist`);
    }
    if (node.parentId === null) {
      // Root message — add new root
      return this.tree.addRoot(newMessage);
    }
    return this.tree.branch(node.parentId, newMessage);
  }

  /**
   * Regenerate a response by creating a new branch from its parent.
   * Semantically identical to `edit()` — creates a sibling alternative.
   *
   * @param messageId - ID of the message to regenerate (a sibling will be created).
   * @param newResponse - The new response content.
   * @returns The new node's ID.
   * @throws If messageId does not exist.
   */
  regenerate(messageId: string, newResponse: M): string {
    return this.edit(messageId, newResponse);
  }

  // ─── Alternative Navigation ─────────────────────────────────

  /**
   * Whether a message has alternative siblings (branches).
   */
  hasAlternatives(nodeId: string): boolean {
    return this.alternativeCount(nodeId) > 1;
  }

  /**
   * Total number of alternatives (siblings) for a message.
   */
  alternativeCount(nodeId: string): number {
    const { siblings } = this.tree.getSiblings(nodeId);
    return siblings.length;
  }

  /**
   * 0-based index of a message among its siblings.
   */
  alternativeIndex(nodeId: string): number {
    const { index } = this.tree.getSiblings(nodeId);
    return index;
  }

  /**
   * Switch to the next alternative (right) and follow to leaf.
   * Updates the active path.
   * @throws If nodeId does not exist.
   */
  nextAlternative(nodeId: string): void {
    this.tree.nextSibling(nodeId);
  }

  /**
   * Switch to the previous alternative (left) and follow to leaf.
   * Updates the active path.
   * @throws If nodeId does not exist.
   */
  prevAlternative(nodeId: string): void {
    this.tree.prevSibling(nodeId);
  }

  // ─── Persistence ────────────────────────────────────────────

  /**
   * Replace the entire conversation history with a single summary message.
   * Clears all branches and resets the tree to one root node tagged
   * `{ compacted: true }`. Use this after generating a summary from the AI
   * to compress long conversations before they exceed the context window.
   */
  compact(summary: M): void {
    this.tree.clear();
    this.tree.append(summary, {
      compacted: true,
      compactedAt: new Date().toISOString(),
    });
  }

  /** Serialize to a JSON string. */
  toJSON(): string {
    return JSON.stringify(this.tree.serialize());
  }

  /** Restore from a JSON string. */
  static fromJSON<M>(json: string, config?: TreeConfig): ChatHistory<M> {
    const data = JSON.parse(json);
    const history = new ChatHistory<M>(config);
    const tree = MessageTree.deserialize<M>(data, config);
    // Replace the internal tree
    (history as { tree: MessageTree<M> }).tree = tree;
    return history;
  }
}
