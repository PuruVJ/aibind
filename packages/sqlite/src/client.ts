/**
 * Minimal async SQLite client interface.
 *
 * Compatible out-of-the-box with `@libsql/client` (Turso).
 * For `better-sqlite3`, use `wrapBetterSqlite3()`.
 */
export interface SqliteResult {
  rows: Array<Record<string, unknown>>;
}

export interface SqliteClient {
  /** Execute a single statement. */
  execute(stmt: { sql: string; args?: unknown[] }): Promise<SqliteResult>;
  /**
   * Execute multiple statements atomically (in a transaction).
   * Used for operations that must succeed or fail together.
   */
  batch(stmts: Array<{ sql: string; args?: unknown[] }>): Promise<SqliteResult[]>;
}

type BetterSqliteDatabase = {
  prepare(sql: string): {
    reader: boolean;
    run(...args: unknown[]): void;
    all(...args: unknown[]): unknown[];
  };
  transaction<T>(fn: () => T): { (): T };
};

/**
 * Wrap a `better-sqlite3` Database as a `SqliteClient`.
 *
 * Uses structural typing — any object with the right shape works.
 * `batch()` runs statements inside a single transaction.
 *
 * @example
 * ```ts
 * import Database from "better-sqlite3";
 * import { wrapBetterSqlite3, SqliteStreamStore } from "@aibind/sqlite";
 *
 * const db = new Database("streams.db");
 * const store = await SqliteStreamStore.create(wrapBetterSqlite3(db));
 * ```
 */
export function wrapBetterSqlite3(db: BetterSqliteDatabase): SqliteClient {
  function runOne(stmt: { sql: string; args?: unknown[] }): SqliteResult {
    const prepared = db.prepare(stmt.sql);
    const args = stmt.args ?? [];
    if (prepared.reader) {
      return { rows: prepared.all(...args) as Record<string, unknown>[] };
    }
    prepared.run(...args);
    return { rows: [] };
  }

  return {
    execute(stmt) {
      return Promise.resolve(runOne(stmt));
    },
    batch(stmts) {
      const results = db.transaction(() => stmts.map(runOne))();
      return Promise.resolve(results);
    },
  };
}
