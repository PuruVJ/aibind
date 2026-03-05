import {
  ChatHistory as CoreChatHistory,
  type TreeConfig,
  type TreeNode,
} from "@aibind/core";

/**
 * Svelte 5 reactive wrapper around ChatHistory.
 *
 * All mutations automatically trigger reactive updates.
 * Access the underlying `ChatHistory` via the `inner` property for
 * non-reactive operations or direct tree access.
 *
 * @example
 * ```svelte
 * <script>
 *   import { ChatHistory } from '@aibind/svelte/history';
 *
 *   const chat = new ChatHistory();
 *   const m1 = chat.append({ role: 'user', content: 'Hello' });
 *   // chat.messages is reactive — UI updates automatically
 * </script>
 *
 * {#each chat.messages as msg, i}
 *   <div>{msg.role}: {msg.content}</div>
 *   {#if chat.hasAlternatives(chat.nodeIds[i])}
 *     <button onclick={() => chat.prevAlternative(chat.nodeIds[i])}>←</button>
 *     {chat.alternativeIndex(chat.nodeIds[i]) + 1}/{chat.alternativeCount(chat.nodeIds[i])}
 *     <button onclick={() => chat.nextAlternative(chat.nodeIds[i])}>→</button>
 *   {/if}
 * {/each}
 * ```
 */
export class ChatHistory<M> {
  /** The underlying non-reactive ChatHistory. */
  readonly inner: CoreChatHistory<M>;

  /** Reactivity trigger — bumped on every mutation. */
  #version = $state(0);

  /** Linear message path from root to active leaf. Reactive. */
  messages: M[] = $derived.by(() => {
    this.#version;
    return this.inner.messages;
  });

  /** Node IDs corresponding to each message. Reactive. */
  nodeIds: string[] = $derived.by(() => {
    this.#version;
    return this.inner.nodeIds;
  });

  /** Whether the history is empty. Reactive. */
  isEmpty: boolean = $derived.by(() => {
    this.#version;
    return this.inner.isEmpty;
  });

  /** Total messages across all branches. Reactive. */
  size: number = $derived.by(() => {
    this.#version;
    return this.inner.size;
  });

  constructor(config?: TreeConfig) {
    this.inner = new CoreChatHistory<M>(config);
  }

  // ─── Mutations (trigger reactivity) ─────────────────────────

  /** Append a message to the current conversation path. */
  append(message: M): string {
    const id = this.inner.append(message);
    this.#version++;
    return id;
  }

  /** Edit a message — creates a sibling branch and sets it active. */
  edit(messageId: string, newMessage: M): string {
    const id = this.inner.edit(messageId, newMessage);
    this.#version++;
    return id;
  }

  /** Regenerate a response — creates a sibling branch and sets it active. */
  regenerate(messageId: string, newResponse: M): string {
    const id = this.inner.regenerate(messageId, newResponse);
    this.#version++;
    return id;
  }

  // ─── Alternative Navigation ─────────────────────────────────

  /** Whether a message has alternative siblings. */
  hasAlternatives(nodeId: string): boolean {
    return this.inner.hasAlternatives(nodeId);
  }

  /** Total alternatives for a message. */
  alternativeCount(nodeId: string): number {
    return this.inner.alternativeCount(nodeId);
  }

  /** 0-based index among siblings. */
  alternativeIndex(nodeId: string): number {
    return this.inner.alternativeIndex(nodeId);
  }

  /** Switch to next alternative and update active path. */
  nextAlternative(nodeId: string): void {
    this.inner.nextAlternative(nodeId);
    this.#version++;
  }

  /** Switch to previous alternative and update active path. */
  prevAlternative(nodeId: string): void {
    this.inner.prevAlternative(nodeId);
    this.#version++;
  }

  // ─── Persistence ────────────────────────────────────────────

  /** Serialize to JSON string. */
  toJSON(): string {
    return this.inner.toJSON();
  }

  /** Restore from JSON string. */
  static fromJSON<M>(json: string, config?: TreeConfig): ChatHistory<M> {
    const instance = new ChatHistory<M>(config);
    const restored = CoreChatHistory.fromJSON<M>(json, config);
    (instance as { inner: CoreChatHistory<M> }).inner = restored;
    return instance;
  }
}
