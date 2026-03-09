import {
  ChatHistory,
  type ConversationMessage,
  type ConversationStore,
} from "@aibind/core";
import type { SqliteClient } from "./client";

export interface SqliteConversationStoreOptions {
  /**
   * Name of the conversations table.
   * @default "aibind_conversations"
   *
   * Required schema:
   * ```sql
   * CREATE TABLE aibind_conversations (
   *   session_id TEXT    PRIMARY KEY,
   *   data       TEXT    NOT NULL,
   *   expires_at INTEGER NOT NULL
   * );
   * ```
   */
  table?: string;
  /** TTL in ms for stored conversations. Default: 1_800_000 (30 min). */
  ttlMs?: number;
}

/**
 * SQLite-backed ConversationStore for server-side multi-turn history.
 *
 * Works with any `SqliteClient` — use `@libsql/client` (Turso) directly,
 * or wrap a `better-sqlite3` Database with `wrapBetterSqlite3()`.
 *
 * **You must create the required table before using this store.**
 * See `SqliteConversationStoreOptions` for the expected schema, or the
 * `@aibind/sqlite` documentation for full migration examples.
 *
 * @example
 * ```ts
 * // Turso / libsql — table already created by your migration tool
 * import { createClient } from "@libsql/client";
 * import { SqliteConversationStore } from "@aibind/sqlite";
 *
 * const client = createClient({ url: process.env.TURSO_URL, authToken: process.env.TURSO_TOKEN });
 * const store = new SqliteConversationStore(client);
 *
 * export const handle = createStreamHandler({ models, conversation: { store } });
 * ```
 */
export class SqliteConversationStore implements ConversationStore {
  readonly #client: SqliteClient;
  readonly #table: string;
  readonly #ttlMs: number;

  constructor(client: SqliteClient, options?: SqliteConversationStoreOptions) {
    this.#client = client;
    this.#table = options?.table ?? "aibind_conversations";
    this.#ttlMs = options?.ttlMs ?? 1_800_000;
  }

  async load(sessionId: string): Promise<ChatHistory<ConversationMessage>> {
    const result = await this.#client.execute({
      sql: `SELECT data FROM ${this.#table} WHERE session_id = ? AND expires_at > ?`,
      args: [sessionId, Date.now()],
    });
    const row = result.rows[0];
    if (!row) return new ChatHistory<ConversationMessage>();
    return ChatHistory.fromJSON<ConversationMessage>(row.data as string);
  }

  async save(
    sessionId: string,
    chat: ChatHistory<ConversationMessage>,
  ): Promise<void> {
    const expiresAt = Date.now() + this.#ttlMs;
    await this.#client.execute({
      sql: `INSERT INTO ${this.#table} (session_id, data, expires_at)
            VALUES (?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`,
      args: [sessionId, chat.toJSON(), expiresAt],
    });
  }

  async delete(sessionId: string): Promise<void> {
    await this.#client.execute({
      sql: `DELETE FROM ${this.#table} WHERE session_id = ?`,
      args: [sessionId],
    });
  }

  /** Remove expired conversation records. Call periodically for housekeeping. */
  async cleanup(): Promise<void> {
    await this.#client.execute({
      sql: `DELETE FROM ${this.#table} WHERE expires_at < ?`,
      args: [Date.now()],
    });
  }
}
