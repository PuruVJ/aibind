/**
 * Server-side conversation history store.
 *
 * Works with ChatHistory<ConversationMessage> — the same tree structure
 * used on the client, without reactivity. Implementations persist the
 * serialized form (chat.toJSON()) and deserialize on load.
 *
 * MemoryConversationStore ships as the default. Plug in Redis, Postgres,
 * KV, etc. by implementing this interface.
 */

import type { ChatHistory } from "./chat-history";

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ConversationStore {
  /**
   * Load the conversation for a session.
   * Returns an empty ChatHistory if the session does not exist.
   */
  load(sessionId: string): Promise<ChatHistory<ConversationMessage>>;

  /**
   * Persist the conversation tree for a session.
   * Implementations should store chat.toJSON() and deserialize on load.
   */
  save(
    sessionId: string,
    chat: ChatHistory<ConversationMessage>,
  ): Promise<void>;

  /** Delete a session and its history. */
  delete(sessionId: string): Promise<void>;
}
