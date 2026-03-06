/**
 * Minimal async PostgreSQL client interface.
 *
 * Compatible out-of-the-box with `pg` (node-postgres) Pool/Client.
 * For `postgres.js` and `@neondatabase/serverless`, use the provided adapters.
 */
export interface PostgresResult {
  rows: Array<Record<string, unknown>>;
}

export interface PostgresClient {
  query(sql: string, params?: unknown[]): Promise<PostgresResult>;
}

type PostgresJsSql = {
  unsafe(query: string, params?: unknown[]): Promise<Array<Record<string, unknown>>>;
};

/**
 * Wrap a `postgres.js` sql instance as a `PostgresClient`.
 *
 * @example
 * ```ts
 * import postgres from "postgres";
 * import { wrapPostgresJs, PostgresStreamStore } from "@aibind/postgres";
 *
 * const sql = postgres(process.env.DATABASE_URL!);
 * const store = new PostgresStreamStore(wrapPostgresJs(sql));
 * ```
 */
export function wrapPostgresJs(sql: PostgresJsSql): PostgresClient {
  return {
    async query(q, params) {
      const rows = await sql.unsafe(q, params as unknown[]);
      return { rows };
    },
  };
}

type NeonSql = {
  (query: string, params?: unknown[]): Promise<Array<Record<string, unknown>>>;
};

/**
 * Wrap a Neon serverless `neon()` function as a `PostgresClient`.
 *
 * @example
 * ```ts
 * import { neon } from "@neondatabase/serverless";
 * import { wrapNeon, PostgresStreamStore } from "@aibind/postgres";
 *
 * const sql = neon(process.env.DATABASE_URL!);
 * const store = new PostgresStreamStore(wrapNeon(sql));
 * ```
 */
export function wrapNeon(sql: NeonSql): PostgresClient {
  return {
    async query(q, params) {
      const rows = await sql(q, params);
      return { rows };
    },
  };
}
