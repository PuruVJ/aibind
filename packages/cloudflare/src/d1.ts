import type { SqliteClient, SqliteResult } from "@aibind/sqlite";

/**
 * Minimal structural type matching the Cloudflare D1 binding.
 * Avoids importing `@cloudflare/workers-types` as a hard dependency.
 */
type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: unknown }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[],
  ): Promise<Array<{ results: T[] }>>;
};

/**
 * Wrap a Cloudflare D1 database binding as a `SqliteClient`.
 *
 * Allows using `SqliteStreamStore` and `SqliteConversationStore` from
 * `@aibind/sqlite` in a Cloudflare Worker without any changes.
 *
 * D1's `batch()` runs all statements in a single implicit transaction,
 * satisfying the atomicity contract required by `SqliteClient.batch()`.
 *
 * @example
 * ```ts
 * import { wrapD1 } from "@aibind/cloudflare";
 * import { SqliteStreamStore, SqliteConversationStore } from "@aibind/sqlite";
 *
 * export default {
 *   async fetch(request, env) {
 *     const db = wrapD1(env.DB);
 *     const streamStore = new SqliteStreamStore(db);
 *     const conversationStore = new SqliteConversationStore(db);
 *     // ...
 *   }
 * }
 * ```
 */
export function wrapD1(db: D1Database): SqliteClient {
  function toArgs(args?: unknown[]): unknown[] {
    return args ?? [];
  }

  return {
    async execute({ sql, args }): Promise<SqliteResult> {
      const stmt = db.prepare(sql).bind(...toArgs(args));
      const result = await stmt.all<Record<string, unknown>>();
      return { rows: result.results };
    },

    async batch(stmts): Promise<SqliteResult[]> {
      const prepared = stmts.map(({ sql, args }) =>
        db.prepare(sql).bind(...toArgs(args)),
      );
      const results = await db.batch<Record<string, unknown>>(prepared);
      return results.map((r) => ({ rows: r.results }));
    },
  };
}
