import type {
  StreamStore,
  StreamChunk,
  DurableStreamStatus,
} from "@aibind/core";
import type { SqliteClient } from "./client";

export interface SqliteStreamStoreOptions {
  /**
   * Name of the chunks table.
   * @default "aibind_stream_chunks"
   *
   * Required schema:
   * ```sql
   * CREATE TABLE aibind_stream_chunks (
   *   id       TEXT    NOT NULL,
   *   seq      INTEGER NOT NULL,
   *   data     TEXT    NOT NULL,
   *   PRIMARY KEY (id, seq)
   * );
   * ```
   */
  chunksTable?: string;
  /**
   * Name of the status table.
   * @default "aibind_stream_status"
   *
   * Required schema:
   * ```sql
   * CREATE TABLE aibind_stream_status (
   *   id           TEXT    PRIMARY KEY,
   *   state        TEXT    NOT NULL DEFAULT 'active',
   *   error        TEXT,
   *   total_chunks INTEGER NOT NULL DEFAULT 0,
   *   expires_at   INTEGER NOT NULL
   * );
   * ```
   */
  statusTable?: string;
  /** How often to poll for new chunks in readFrom(), in ms. Default: 50. */
  pollIntervalMs?: number;
  /** TTL in ms for auto-cleanup of completed streams. Default: 300_000 (5 min). */
  ttlMs?: number;
}

/**
 * SQLite-backed StreamStore for durable stream resumption.
 *
 * Works with any `SqliteClient` — use `@libsql/client` (Turso) directly,
 * or wrap a `better-sqlite3` Database with `wrapBetterSqlite3()`.
 *
 * **You must create the required tables before using this store.**
 * See `SqliteStreamStoreOptions` for the expected schema, or the
 * `@aibind/sqlite` documentation for full migration examples.
 *
 * @example
 * ```ts
 * // Turso / libsql — tables already created by your migration tool
 * import { createClient } from "@libsql/client";
 * import { SqliteStreamStore } from "@aibind/sqlite";
 *
 * const client = createClient({ url: process.env.TURSO_URL, authToken: process.env.TURSO_TOKEN });
 * const store = new SqliteStreamStore(client);
 *
 * // better-sqlite3
 * import Database from "better-sqlite3";
 * import { wrapBetterSqlite3, SqliteStreamStore } from "@aibind/sqlite";
 *
 * const store = new SqliteStreamStore(wrapBetterSqlite3(new Database("streams.db")));
 * ```
 */
export class SqliteStreamStore implements StreamStore {
  readonly #client: SqliteClient;
  readonly #chunks: string;
  readonly #status: string;
  readonly #pollIntervalMs: number;
  readonly #ttlMs: number;

  constructor(client: SqliteClient, options?: SqliteStreamStoreOptions) {
    this.#client = client;
    this.#chunks = options?.chunksTable ?? "aibind_stream_chunks";
    this.#status = options?.statusTable ?? "aibind_stream_status";
    this.#pollIntervalMs = options?.pollIntervalMs ?? 50;
    this.#ttlMs = options?.ttlMs ?? 300_000;
  }

  async create(id: string): Promise<void> {
    const existing = await this.#client.execute({
      sql: `SELECT id FROM ${this.#status} WHERE id = ?`,
      args: [id],
    });
    if (existing.rows.length > 0) throw new Error(`Stream "${id}" already exists`);
    const expiresAt = Date.now() + this.#ttlMs;
    await this.#client.execute({
      sql: `INSERT INTO ${this.#status} (id, state, total_chunks, expires_at) VALUES (?, 'active', 0, ?)`,
      args: [id, expiresAt],
    });
  }

  async append(id: string, chunk: string): Promise<number> {
    const result = await this.#client.execute({
      sql: `SELECT total_chunks FROM ${this.#status} WHERE id = ? AND state = 'active'`,
      args: [id],
    });
    const row = result.rows[0];
    if (!row) throw new Error(`Stream "${id}" not found or not active`);
    const seq = (row.total_chunks as number) + 1;
    await this.#client.batch([
      {
        sql: `INSERT INTO ${this.#chunks} (id, seq, data) VALUES (?, ?, ?)`,
        args: [id, seq, chunk],
      },
      {
        sql: `UPDATE ${this.#status} SET total_chunks = ? WHERE id = ?`,
        args: [seq, id],
      },
    ]);
    return seq;
  }

  async *readFrom(
    id: string,
    afterSeq: number,
  ): AsyncGenerator<StreamChunk, void, undefined> {
    let cursor = afterSeq;

    while (true) {
      const result = await this.#client.execute({
        sql: `SELECT seq, data FROM ${this.#chunks} WHERE id = ? AND seq > ? ORDER BY seq`,
        args: [id, cursor],
      });

      for (const row of result.rows) {
        cursor = row.seq as number;
        yield { seq: row.seq as number, data: row.data as string };
      }

      const statusResult = await this.#client.execute({
        sql: `SELECT state FROM ${this.#status} WHERE id = ?`,
        args: [id],
      });
      const status = statusResult.rows[0];

      if (!status || (status.state as string) !== "active") {
        // Final drain for any chunks written between last read and status change
        const remaining = await this.#client.execute({
          sql: `SELECT seq, data FROM ${this.#chunks} WHERE id = ? AND seq > ? ORDER BY seq`,
          args: [id, cursor],
        });
        for (const row of remaining.rows) {
          yield { seq: row.seq as number, data: row.data as string };
        }
        return;
      }

      await new Promise<void>((resolve) =>
        setTimeout(resolve, this.#pollIntervalMs),
      );
    }
  }

  async getStatus(id: string): Promise<DurableStreamStatus | null> {
    const result = await this.#client.execute({
      sql: `SELECT state, error, total_chunks FROM ${this.#status} WHERE id = ?`,
      args: [id],
    });
    const row = result.rows[0];
    if (!row) return null;
    return {
      state: row.state as DurableStreamStatus["state"],
      error: (row.error as string | null) ?? undefined,
      totalChunks: row.total_chunks as number,
    };
  }

  async stop(id: string): Promise<void> {
    await this.#setTerminal(id, "stopped");
  }

  async complete(id: string): Promise<void> {
    await this.#setTerminal(id, "done");
  }

  async fail(id: string, error: string): Promise<void> {
    await this.#setTerminal(id, "error", error);
  }

  async #setTerminal(
    id: string,
    state: DurableStreamStatus["state"],
    error?: string,
  ): Promise<void> {
    await this.#client.execute({
      sql: `UPDATE ${this.#status} SET state = ?, error = ? WHERE id = ? AND state = 'active'`,
      args: [state, error ?? null, id],
    });
  }

  /** Remove expired stream records. Call periodically for housekeeping. */
  async cleanup(): Promise<void> {
    const now = Date.now();
    const result = await this.#client.execute({
      sql: `SELECT id FROM ${this.#status} WHERE expires_at < ? AND state != 'active'`,
      args: [now],
    });
    for (const row of result.rows) {
      const id = row.id as string;
      await this.#client.batch([
        { sql: `DELETE FROM ${this.#chunks} WHERE id = ?`, args: [id] },
        { sql: `DELETE FROM ${this.#status} WHERE id = ?`, args: [id] },
      ]);
    }
  }
}
