import type {
  StreamStore,
  StreamChunk,
  DurableStreamStatus,
} from "@aibind/core";
import type { PostgresClient } from "./client";

export interface PostgresStreamStoreOptions {
  /**
   * Name of the chunks table.
   * @default "aibind_stream_chunks"
   *
   * Required schema:
   * ```sql
   * CREATE TABLE aibind_stream_chunks (
   *   id   TEXT    NOT NULL,
   *   seq  INTEGER NOT NULL,
   *   data TEXT    NOT NULL,
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
   *   id           TEXT   PRIMARY KEY,
   *   state        TEXT   NOT NULL DEFAULT 'active',
   *   error        TEXT,
   *   total_chunks INTEGER NOT NULL DEFAULT 0,
   *   expires_at   BIGINT NOT NULL
   * );
   * ```
   */
  statusTable?: string;
  /** How often to poll for new chunks in readFrom(), in ms. Default: 100. */
  pollIntervalMs?: number;
  /** TTL in ms for auto-cleanup of completed streams. Default: 300_000 (5 min). */
  ttlMs?: number;
}

/**
 * PostgreSQL-backed StreamStore for durable stream resumption.
 *
 * Works with `pg` (node-postgres) directly, or use `wrapPostgresJs()`/`wrapNeon()`
 * for postgres.js and Neon serverless.
 *
 * **You must create the required tables before using this store.**
 * See `PostgresStreamStoreOptions` for the expected schema.
 *
 * @example
 * ```ts
 * // pg (node-postgres) — satisfies PostgresClient directly
 * import { Pool } from "pg";
 * import { PostgresStreamStore } from "@aibind/postgres";
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const store = new PostgresStreamStore(pool);
 *
 * // Neon serverless
 * import { neon } from "@neondatabase/serverless";
 * import { wrapNeon, PostgresStreamStore } from "@aibind/postgres";
 *
 * const store = new PostgresStreamStore(wrapNeon(neon(process.env.DATABASE_URL!)));
 * ```
 */
export class PostgresStreamStore implements StreamStore {
  readonly #client: PostgresClient;
  readonly #chunks: string;
  readonly #status: string;
  readonly #pollIntervalMs: number;
  readonly #ttlMs: number;

  constructor(client: PostgresClient, options?: PostgresStreamStoreOptions) {
    this.#client = client;
    this.#chunks = options?.chunksTable ?? "aibind_stream_chunks";
    this.#status = options?.statusTable ?? "aibind_stream_status";
    this.#pollIntervalMs = options?.pollIntervalMs ?? 100;
    this.#ttlMs = options?.ttlMs ?? 300_000;
  }

  async create(id: string): Promise<void> {
    const existing = await this.#client.query(
      `SELECT id FROM ${this.#status} WHERE id = $1`,
      [id],
    );
    if (existing.rows.length > 0)
      throw new Error(`Stream "${id}" already exists`);
    const expiresAt = Date.now() + this.#ttlMs;
    await this.#client.query(
      `INSERT INTO ${this.#status} (id, state, total_chunks, expires_at) VALUES ($1, 'active', 0, $2)`,
      [id, expiresAt],
    );
  }

  async append(id: string, chunk: string): Promise<number> {
    // Atomic CTE: increment total_chunks and insert the new chunk in one round-trip.
    // If stream is not found or not active, the UPDATE matches 0 rows → INSERT selects
    // from an empty CTE → RETURNING seq returns no rows → we throw.
    const result = await this.#client.query(
      `WITH upd AS (
        UPDATE ${this.#status}
        SET total_chunks = total_chunks + 1
        WHERE id = $1 AND state = 'active'
        RETURNING total_chunks
      )
      INSERT INTO ${this.#chunks} (id, seq, data)
      SELECT $1, upd.total_chunks, $2
      FROM upd
      RETURNING seq`,
      [id, chunk],
    );
    if (!result.rows[0])
      throw new Error(`Stream "${id}" not found or not active`);
    return result.rows[0].seq as number;
  }

  async *readFrom(
    id: string,
    afterSeq: number,
  ): AsyncGenerator<StreamChunk, void, undefined> {
    let cursor = afterSeq;

    while (true) {
      const result = await this.#client.query(
        `SELECT seq, data FROM ${this.#chunks} WHERE id = $1 AND seq > $2 ORDER BY seq`,
        [id, cursor],
      );

      for (const row of result.rows) {
        cursor = row.seq as number;
        yield { seq: row.seq as number, data: row.data as string };
      }

      const statusResult = await this.#client.query(
        `SELECT state FROM ${this.#status} WHERE id = $1`,
        [id],
      );
      const status = statusResult.rows[0];

      if (!status || (status.state as string) !== "active") {
        // Final drain for any chunks written between last read and status change
        const remaining = await this.#client.query(
          `SELECT seq, data FROM ${this.#chunks} WHERE id = $1 AND seq > $2 ORDER BY seq`,
          [id, cursor],
        );
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
    const result = await this.#client.query(
      `SELECT state, error, total_chunks FROM ${this.#status} WHERE id = $1`,
      [id],
    );
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
    await this.#client.query(
      `UPDATE ${this.#status} SET state = $1, error = $2 WHERE id = $3 AND state = 'active'`,
      [state, error ?? null, id],
    );
  }

  /** Remove expired stream records. Call periodically for housekeeping. */
  async cleanup(): Promise<void> {
    const now = Date.now();
    const expired = await this.#client.query(
      `DELETE FROM ${this.#status} WHERE expires_at < $1 AND state != 'active' RETURNING id`,
      [now],
    );
    if (expired.rows.length > 0) {
      const ids = expired.rows.map((r) => r.id as string);
      // Postgres ANY($1::text[]) lets us delete all expired chunks in one query
      await this.#client.query(
        `DELETE FROM ${this.#chunks} WHERE id = ANY($1::text[])`,
        [ids],
      );
    }
  }
}
