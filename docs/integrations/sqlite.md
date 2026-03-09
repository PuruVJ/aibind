# @aibind/sqlite

SQLite-backed `StreamStore` and `ConversationStore`. Works with [Turso](https://turso.tech) (`@libsql/client`), local `better-sqlite3`, or any driver that implements the `SqliteClient` interface.

## Installation

::: code-group

```bash [pnpm]
pnpm add @aibind/sqlite
```

```bash [npm]
npm install @aibind/sqlite
```

```bash [bun]
bun add @aibind/sqlite
```

:::

## Setup

### With Turso / libsql

`@libsql/client` already matches the `SqliteClient` interface — pass it directly:

```ts
import { createClient } from "@libsql/client";
import { SqliteStreamStore, SqliteConversationStore } from "@aibind/sqlite";

const db = createClient({
  url: process.env.TURSO_URL!,
  authToken: process.env.TURSO_TOKEN!,
});

const streamStore = new SqliteStreamStore(db);
const conversationStore = new SqliteConversationStore(db);
```

### With better-sqlite3 (Node.js)

Wrap the synchronous `Database` instance with `wrapBetterSqlite3()`:

```ts
import Database from "better-sqlite3";
import {
  wrapBetterSqlite3,
  SqliteStreamStore,
  SqliteConversationStore,
} from "@aibind/sqlite";

const db = wrapBetterSqlite3(new Database("app.db"));

const streamStore = new SqliteStreamStore(db);
const conversationStore = new SqliteConversationStore(db);
```

::: warning Node.js only
`better-sqlite3` is a native Node.js addon. It does **not** work with Bun. Use `wrapBunSqlite` instead (see below).
:::

### With Bun's built-in SQLite

Bun ships a built-in `bun:sqlite` module. Use `wrapBunSqlite()`:

```ts
import { Database } from "bun:sqlite";
import {
  wrapBunSqlite,
  SqliteStreamStore,
  SqliteConversationStore,
} from "@aibind/sqlite";

const db = wrapBunSqlite(new Database("app.db"));

const streamStore = new SqliteStreamStore(db);
const conversationStore = new SqliteConversationStore(db);
```

## Required Schema

`@aibind/sqlite` does **not** create tables automatically — you run your own migrations using whatever tool you prefer (Drizzle, Prisma, raw SQL, Turso migration files, etc.).

### Stream tables

Used by `SqliteStreamStore`:

```sql
CREATE TABLE aibind_stream_chunks (
  id       TEXT    NOT NULL,
  seq      INTEGER NOT NULL,
  data     TEXT    NOT NULL,
  PRIMARY KEY (id, seq)
);

CREATE TABLE aibind_stream_status (
  id           TEXT    PRIMARY KEY,
  state        TEXT    NOT NULL DEFAULT 'active',
  error        TEXT,
  total_chunks INTEGER NOT NULL DEFAULT 0,
  expires_at   INTEGER NOT NULL
);
```

### Conversation table

Used by `SqliteConversationStore`:

```sql
CREATE TABLE aibind_conversations (
  session_id TEXT    PRIMARY KEY,
  data       TEXT    NOT NULL,
  expires_at INTEGER NOT NULL
);
```

### Custom table names

If you already have tables with different names, or follow a specific naming convention, pass the names in the options:

```ts
const streamStore = new SqliteStreamStore(db, {
  chunksTable: "my_ai_chunks",
  statusTable: "my_ai_status",
});

const conversationStore = new SqliteConversationStore(db, {
  table: "my_conversations",
});
```

## Usage

### Durable streams

```ts
import { createStreamHandler } from "@aibind/sveltekit/server";
import { SqliteStreamStore } from "@aibind/sqlite";

const store = new SqliteStreamStore(db);

export const handle = createStreamHandler({
  models,
  store,
  resumable: true,
});
```

### Conversation history

```ts
import { createStreamHandler } from "@aibind/sveltekit/server";
import { SqliteConversationStore } from "@aibind/sqlite";

const store = new SqliteConversationStore(db);

export const handle = createStreamHandler({
  models,
  conversation: { store },
});
```

### Cleanup

Both stores have a `cleanup()` method to remove expired records. Call it periodically — e.g., in a cron job or on a timer:

```ts
// Run every 10 minutes
setInterval(
  async () => {
    await streamStore.cleanup();
    await conversationStore.cleanup();
  },
  10 * 60 * 1000,
);
```

### Options reference

**`SqliteStreamStore`**

| Option           | Type     | Default                  | Description                                      |
| ---------------- | -------- | ------------------------ | ------------------------------------------------ |
| `chunksTable`    | `string` | `"aibind_stream_chunks"` | Name of the chunks table                         |
| `statusTable`    | `string` | `"aibind_stream_status"` | Name of the status table                         |
| `pollIntervalMs` | `number` | `50`                     | How often to poll for new chunks in `readFrom()` |
| `ttlMs`          | `number` | `300_000`                | TTL for completed streams before cleanup         |

**`SqliteConversationStore`**

| Option  | Type     | Default                  | Description                               |
| ------- | -------- | ------------------------ | ----------------------------------------- |
| `table` | `string` | `"aibind_conversations"` | Name of the conversations table           |
| `ttlMs` | `number` | `1_800_000`              | TTL for idle conversations before cleanup |

## SqliteClient interface

The `SqliteClient` interface is a minimal subset of `@libsql/client` — you can implement it yourself for any driver:

```ts
export interface SqliteClient {
  execute(stmt: { sql: string; args?: unknown[] }): Promise<SqliteResult>;
  batch(
    stmts: Array<{ sql: string; args?: unknown[] }>,
  ): Promise<SqliteResult[]>;
}

export interface SqliteResult {
  rows: Array<Record<string, unknown>>;
}
```

`batch()` must run all statements atomically (in a single transaction). Both `wrapBetterSqlite3()` and `wrapBunSqlite()` implement this via `db.transaction()`.
