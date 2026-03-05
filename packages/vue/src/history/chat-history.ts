import { ref, computed, type ComputedRef } from "vue";
import { ChatHistory as CoreChatHistory, type TreeConfig } from "@aibind/core";

/**
 * Vue 3 reactive wrapper around `ChatHistory` from `@aibind/core`.
 *
 * Exposes all `ChatHistory` operations while making key getters reactive
 * via Vue's `ref` and `computed`. Mutations bump an internal version counter
 * so that any `computed` that reads from the wrapper automatically re-evaluates.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { ChatHistory } from '@aibind/vue/history';
 *
 * interface Msg { role: string; content: string }
 * const chat = new ChatHistory<Msg>();
 *
 * function send(text: string) {
 *   chat.append({ role: 'user', content: text });
 * }
 * </script>
 *
 * <template>
 *   <p>{{ chat.size.value }} messages</p>
 *   <ul>
 *     <li v-for="(msg, i) in chat.messages.value" :key="chat.nodeIds.value[i]">
 *       <strong>{{ msg.role }}:</strong> {{ msg.content }}
 *     </li>
 *   </ul>
 *   <button @click="send('Hello!')">Send</button>
 * </template>
 * ```
 *
 * @typeParam M - The message type stored in the history.
 */
export class ChatHistory<M> {
  /** The underlying non-reactive `ChatHistory` instance. */
  readonly inner: CoreChatHistory<M>;

  /**
   * Internal version counter. Bumped on every mutation so that
   * Vue `computed` refs that depend on it re-evaluate.
   */
  private _version = ref(0);

  /** Reactive linear message path from root to the active leaf. */
  readonly messages: ComputedRef<M[]>;

  /** Reactive node IDs corresponding to each message in the active path. */
  readonly nodeIds: ComputedRef<string[]>;

  /** Reactive flag indicating whether the history has any messages. */
  readonly isEmpty: ComputedRef<boolean>;

  /** Reactive total number of messages across all branches. */
  readonly size: ComputedRef<number>;

  constructor(config?: TreeConfig) {
    this.inner = new CoreChatHistory<M>(config);

    this.messages = computed(() => {
      this._version.value;
      return this.inner.messages;
    });

    this.nodeIds = computed(() => {
      this._version.value;
      return this.inner.nodeIds;
    });

    this.isEmpty = computed(() => {
      this._version.value;
      return this.inner.isEmpty;
    });

    this.size = computed(() => {
      this._version.value;
      return this.inner.size;
    });
  }

  /**
   * Append a message to the current conversation path.
   * @returns The new node's ID.
   */
  append(message: M): string {
    const id = this.inner.append(message);
    this._version.value++;
    return id;
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
    const id = this.inner.edit(messageId, newMessage);
    this._version.value++;
    return id;
  }

  /**
   * Regenerate a response by creating a new branch from its parent.
   * Semantically identical to `edit()` -- creates a sibling alternative.
   *
   * @param messageId - ID of the message to regenerate.
   * @param newResponse - The new response content.
   * @returns The new node's ID.
   * @throws If messageId does not exist.
   */
  regenerate(messageId: string, newResponse: M): string {
    const id = this.inner.regenerate(messageId, newResponse);
    this._version.value++;
    return id;
  }

  /**
   * Whether a message has alternative siblings (branches).
   */
  hasAlternatives(nodeId: string): boolean {
    return this.inner.hasAlternatives(nodeId);
  }

  /**
   * Total number of alternatives (siblings) for a message.
   */
  alternativeCount(nodeId: string): number {
    return this.inner.alternativeCount(nodeId);
  }

  /**
   * 0-based index of a message among its siblings.
   */
  alternativeIndex(nodeId: string): number {
    return this.inner.alternativeIndex(nodeId);
  }

  /**
   * Switch to the next alternative (right) and follow to leaf.
   * Updates the active path.
   * @throws If nodeId does not exist.
   */
  nextAlternative(nodeId: string): void {
    this.inner.nextAlternative(nodeId);
    this._version.value++;
  }

  /**
   * Switch to the previous alternative (left) and follow to leaf.
   * Updates the active path.
   * @throws If nodeId does not exist.
   */
  prevAlternative(nodeId: string): void {
    this.inner.prevAlternative(nodeId);
    this._version.value++;
  }

  /**
   * Serialize to a JSON string.
   */
  toJSON(): string {
    return this.inner.toJSON();
  }

  /**
   * Restore a `ChatHistory` from a JSON string.
   * The returned instance has fully reactive computed properties.
   *
   * @param json - JSON string previously produced by `toJSON()`.
   * @param config - Optional tree configuration (e.g. custom ID generator).
   */
  static fromJSON<M>(json: string, config?: TreeConfig): ChatHistory<M> {
    const instance = new ChatHistory<M>(config);
    const restored = CoreChatHistory.fromJSON<M>(json, config);
    (instance as { inner: CoreChatHistory<M> }).inner = restored;
    return instance;
  }
}
