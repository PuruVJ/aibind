import { ChatHistory, type ConversationMessage, type ConversationStore } from "@aibind/core";
import type { PostgresClient } from "./client";

export interface PostgresConversationStoreOptions {
  /**
   * Name of the conversations table.
   * @default "aibind_conversations"
   *
   * Required schema:
   * ```sql
   * CREATE TABLE aibind_conversations (
   *   session_id TEXT   PRIMARY KEY,
   *   data       TEXT   NOT NULL,
   *   expires_at BIGINT NOT NULL
   * );
   * ```
   */
  table?: string;
  /** TTL in ms for stored conversations. Default: 1_800_000 (30 min). */
  ttlMs?: number;
}

/**
 * PostgreSQL-backed ConversationStore for server-side multi-turn history.
 *
 * Works with `pg` (node-postgres) directly, or use `wrapPostgresJs()`/`wrapNeon()`
 * for postgres.js and Neon serverless.
 *
 * **You must create the required table before using this store.**
 * See `PostgresConversationStoreOptions` for the expected schema.
 *
 * @example
 * ```ts
 * import { Pool } from "pg";
 * import { PostgresConversationStore } from "@aibind/postgres";
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const store = new PostgresConversationStore(pool);
 *
 * export const handle = createStreamHandler({ models, conversation: { store } });
 * ```
 */
export class PostgresConversationStore implements ConversationStore {
  readonly #client: PostgresClient;
  readonly #table: string;
  readonly #ttlMs: number;

  constructor(client: PostgresClient, options?: PostgresConversationStoreOptions) {
    this.#client = client;
    this.#table = options?.table ?? "aibind_conversations";
    this.#ttlMs = options?.ttlMs ?? 1_800_000;
  }

  async load(sessionId: string): Promise<ChatHistory<ConversationMessage>> {
    const result = await this.#client.query(
      `SELECT data FROM ${this.#table} WHERE session_id = $1 AND expires_at > $2`,
      [sessionId, Date.now()],
    );
    const row = result.rows[0];
    if (!row) return new ChatHistory<ConversationMessage>();
    return ChatHistory.fromJSON<ConversationMessage>(row.data as string);
  }

  async save(
    sessionId: string,
    chat: ChatHistory<ConversationMessage>,
  ): Promise<void> {
    const expiresAt = Date.now() + this.#ttlMs;
    await this.#client.query(
      `INSERT INTO ${this.#table} (session_id, data, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_id)
       DO UPDATE SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at`,
      [sessionId, chat.toJSON(), expiresAt],
    );
  }

  async delete(sessionId: string): Promise<void> {
    await this.#client.query(
      `DELETE FROM ${this.#table} WHERE session_id = $1`,
      [sessionId],
    );
  }

  /** Remove expired conversation records. Call periodically for housekeeping. */
  async cleanup(): Promise<void> {
    await this.#client.query(
      `DELETE FROM ${this.#table} WHERE expires_at < $1`,
      [Date.now()],
    );
  }
}
