# @aibind/postgres

PostgreSQL-backed `StreamStore` and `ConversationStore`. Works with [`pg`](https://node-postgres.com) (node-postgres), [`postgres.js`](https://github.com/porsager/postgres), [Neon](https://neon.tech), [Supabase](https://supabase.com), [Vercel Postgres](https://vercel.com/storage/postgres), and any compatible client.

## Installation

::: code-group

```bash [pnpm]
pnpm add @aibind/postgres
```

```bash [npm]
npm install @aibind/postgres
```

```bash [bun]
bun add @aibind/postgres
```

:::

## Setup

### With `pg` (node-postgres)

`pg.Pool` satisfies the `PostgresClient` interface directly — pass it straight in:

```ts
import { Pool } from "pg";
import {
  PostgresStreamStore,
  PostgresConversationStore,
} from "@aibind/postgres";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const streamStore = new PostgresStreamStore(pool);
const conversationStore = new PostgresConversationStore(pool);
```

### With Neon serverless

```ts
import { neon } from "@neondatabase/serverless";
import {
  wrapNeon,
  PostgresStreamStore,
  PostgresConversationStore,
} from "@aibind/postgres";

const db = wrapNeon(neon(process.env.DATABASE_URL!));

const streamStore = new PostgresStreamStore(db);
const conversationStore = new PostgresConversationStore(db);
```

### With `postgres.js`

```ts
import postgres from "postgres";
import { wrapPostgresJs, PostgresStreamStore } from "@aibind/postgres";

const db = wrapPostgresJs(postgres(process.env.DATABASE_URL!));
const streamStore = new PostgresStreamStore(db);
```

### With Supabase

Supabase exposes a standard Postgres connection — use any `pg`-compatible client with the connection string from your Supabase project settings:

```ts
import { Pool } from "pg";
import { PostgresStreamStore } from "@aibind/postgres";

const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL });
const store = new PostgresStreamStore(pool);
```

## Required Schema

`@aibind/postgres` does **not** create tables automatically. Run these migrations with your preferred tool (Drizzle, Prisma, raw SQL, etc.):

### Stream tables

Used by `PostgresStreamStore`:

```sql
CREATE TABLE aibind_stream_chunks (
  id   TEXT    NOT NULL,
  seq  INTEGER NOT NULL,
  data TEXT    NOT NULL,
  PRIMARY KEY (id, seq)
);

CREATE TABLE aibind_stream_status (
  id           TEXT    PRIMARY KEY,
  state        TEXT    NOT NULL DEFAULT 'active',
  error        TEXT,
  total_chunks INTEGER NOT NULL DEFAULT 0,
  expires_at   BIGINT  NOT NULL
);
```

### Conversation table

Used by `PostgresConversationStore`:

```sql
CREATE TABLE aibind_conversations (
  session_id TEXT   PRIMARY KEY,
  data       TEXT   NOT NULL,
  expires_at BIGINT NOT NULL
);
```

### Custom table names

```ts
const streamStore = new PostgresStreamStore(pool, {
  chunksTable: "my_stream_chunks",
  statusTable: "my_stream_status",
});

const conversationStore = new PostgresConversationStore(pool, {
  table: "my_conversations",
});
```

## Usage

### Durable streams

```ts
import { createStreamHandler } from "@aibind/sveltekit/server";
import { PostgresStreamStore } from "@aibind/postgres";

const store = new PostgresStreamStore(pool);

export const handle = createStreamHandler({
  models,
  store,
  resumable: true,
});
```

### Conversation history

```ts
import { createStreamHandler } from "@aibind/sveltekit/server";
import { PostgresConversationStore } from "@aibind/postgres";

const store = new PostgresConversationStore(pool);

export const handle = createStreamHandler({
  models,
  conversation: { store },
});
```

### Cleanup

Call periodically (e.g., cron job) to remove expired records:

```ts
setInterval(
  async () => {
    await streamStore.cleanup();
    await conversationStore.cleanup();
  },
  10 * 60 * 1000,
);
```

`PostgresStreamStore.cleanup()` uses `DELETE ... RETURNING id` + `ANY($1::text[])` to remove all expired chunks in two queries, regardless of how many streams expired.

## Options reference

**`PostgresStreamStore`**

| Option           | Type     | Default                  | Description                                      |
| ---------------- | -------- | ------------------------ | ------------------------------------------------ |
| `chunksTable`    | `string` | `"aibind_stream_chunks"` | Name of the chunks table                         |
| `statusTable`    | `string` | `"aibind_stream_status"` | Name of the status table                         |
| `pollIntervalMs` | `number` | `100`                    | How often to poll for new chunks in `readFrom()` |
| `ttlMs`          | `number` | `300_000`                | TTL for completed streams before cleanup         |

**`PostgresConversationStore`**

| Option  | Type     | Default                  | Description                               |
| ------- | -------- | ------------------------ | ----------------------------------------- |
| `table` | `string` | `"aibind_conversations"` | Name of the conversations table           |
| `ttlMs` | `number` | `1_800_000`              | TTL for idle conversations before cleanup |

## PostgresClient interface

`pg.Pool` and `pg.Client` implement this directly. Use `wrapPostgresJs()` or `wrapNeon()` for other drivers:

```ts
export interface PostgresClient {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
}
```
