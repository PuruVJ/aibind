import { useSyncExternalStore } from "react";
import { ChatHistory as CoreChatHistory, type TreeConfig } from "@aibind/core";

/**
 * React reactive wrapper around {@link CoreChatHistory}.
 *
 * All mutations automatically trigger re-renders via `useSyncExternalStore`.
 * Call `useSnapshot()` inside a component to get reactive state.
 *
 * @example
 * ```tsx
 * const chat = new ChatHistory<{ role: string; content: string }>();
 *
 * function Chat() {
 *   const { messages, nodeIds } = chat.useSnapshot();
 *
 *   return (
 *     <div>
 *       {messages.map((msg, i) => (
 *         <div key={nodeIds[i]}>
 *           {msg.role}: {msg.content}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export class ChatHistory<M> {
  /** The underlying non-reactive ChatHistory. */
  readonly inner: CoreChatHistory<M>;

  private _version = 0;
  private _listeners = new Set<() => void>();

  constructor(config?: TreeConfig) {
    this.inner = new CoreChatHistory<M>(config);
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
   * Re-renders the component when the history changes.
   */
  useSnapshot(): {
    messages: M[];
    nodeIds: string[];
    isEmpty: boolean;
    size: number;
  } {
    useSyncExternalStore(this.subscribe, this.getSnapshot);
    return {
      messages: this.inner.messages,
      nodeIds: this.inner.nodeIds,
      isEmpty: this.inner.isEmpty,
      size: this.inner.size,
    };
  }

  // ─── Mutations (trigger reactivity) ─────────────────────────

  /** Append a message to the current conversation path. */
  append(message: M): string {
    const id = this.inner.append(message);
    this._notify();
    return id;
  }

  /** Edit a message by creating a new branch from its parent. */
  edit(messageId: string, newMessage: M): string {
    const id = this.inner.edit(messageId, newMessage);
    this._notify();
    return id;
  }

  /** Regenerate a response by creating a new branch from its parent. */
  regenerate(messageId: string, newResponse: M): string {
    const id = this.inner.regenerate(messageId, newResponse);
    this._notify();
    return id;
  }

  // ─── Alternative Navigation ─────────────────────────────────

  /** Whether a message has alternative siblings (branches). */
  hasAlternatives(nodeId: string): boolean {
    return this.inner.hasAlternatives(nodeId);
  }

  /** Total number of alternatives (siblings) for a message. */
  alternativeCount(nodeId: string): number {
    return this.inner.alternativeCount(nodeId);
  }

  /** 0-based index of a message among its siblings. */
  alternativeIndex(nodeId: string): number {
    return this.inner.alternativeIndex(nodeId);
  }

  /** Switch to the next alternative (right) and follow to leaf. */
  nextAlternative(nodeId: string): void {
    this.inner.nextAlternative(nodeId);
    this._notify();
  }

  /** Switch to the previous alternative (left) and follow to leaf. */
  prevAlternative(nodeId: string): void {
    this.inner.prevAlternative(nodeId);
    this._notify();
  }

  // ─── Persistence ────────────────────────────────────────────

  /** Serialize to a JSON string. */
  toJSON(): string {
    return this.inner.toJSON();
  }

  /** Restore from a JSON string. Returns a new reactive instance. */
  static fromJSON<M>(json: string, config?: TreeConfig): ChatHistory<M> {
    const instance = new ChatHistory<M>(config);
    const restored = CoreChatHistory.fromJSON<M>(json, config);
    (instance as { inner: CoreChatHistory<M> }).inner = restored;
    instance._version++;
    return instance;
  }
}
