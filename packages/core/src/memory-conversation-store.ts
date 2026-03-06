import { ChatHistory } from "./chat-history";
import type {
  ConversationMessage,
  ConversationStore,
} from "./conversation-store";

interface SessionEntry {
  json: string;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * In-memory ConversationStore implementation.
 *
 * Persists conversation history as JSON strings with TTL cleanup.
 * Default TTL is 30 minutes. Suitable for development and single-instance
 * deployments — use a distributed store (Redis, D1, etc.) for production.
 */
export class MemoryConversationStore implements ConversationStore {
  #sessions = new Map<string, SessionEntry>();
  #ttlMs: number;

  constructor(options?: { ttlMs?: number }) {
    this.#ttlMs = options?.ttlMs ?? 30 * 60 * 1000;
  }

  async load(sessionId: string): Promise<ChatHistory<ConversationMessage>> {
    const entry = this.#sessions.get(sessionId);
    if (!entry) return new ChatHistory<ConversationMessage>();
    return ChatHistory.fromJSON<ConversationMessage>(entry.json);
  }

  async save(
    sessionId: string,
    chat: ChatHistory<ConversationMessage>,
  ): Promise<void> {
    const existing = this.#sessions.get(sessionId);
    if (existing?.timer) clearTimeout(existing.timer);
    const timer = setTimeout(
      () => this.#sessions.delete(sessionId),
      this.#ttlMs,
    );
    this.#sessions.set(sessionId, { json: chat.toJSON(), timer });
  }

  async delete(sessionId: string): Promise<void> {
    const existing = this.#sessions.get(sessionId);
    if (existing?.timer) clearTimeout(existing.timer);
    this.#sessions.delete(sessionId);
  }

  /** Visible for testing — number of active sessions. */
  get size(): number {
    return this.#sessions.size;
  }
}
