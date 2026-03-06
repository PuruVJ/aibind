# @aibind/sqlite

SQLite-backed `StreamStore` and `ConversationStore` for `@aibind`. Works with [Turso](https://turso.tech) (`@libsql/client`), local `better-sqlite3`, or any driver that implements the `SqliteClient` interface.

## Install

```bash
npm install @aibind/sqlite
```

## Usage

```ts
// Turso / libsql
import { createClient } from "@libsql/client";
import { SqliteStreamStore, SqliteConversationStore } from "@aibind/sqlite";

const db = createClient({ url: process.env.TURSO_URL!, authToken: process.env.TURSO_TOKEN! });

const streamStore = new SqliteStreamStore(db);
const conversationStore = new SqliteConversationStore(db);
```

```ts
// better-sqlite3 (Node.js only)
import Database from "better-sqlite3";
import { wrapBetterSqlite3, SqliteStreamStore } from "@aibind/sqlite";

const store = new SqliteStreamStore(wrapBetterSqlite3(new Database("app.db")));
```

```ts
// Bun built-in sqlite
import { Database } from "bun:sqlite";
import { wrapBunSqlite, SqliteStreamStore } from "@aibind/sqlite";

const store = new SqliteStreamStore(wrapBunSqlite(new Database("app.db")));
```

## Required schema

**You must create these tables yourself** — the store does not run migrations automatically.

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
  expires_at   INTEGER NOT NULL
);

CREATE TABLE aibind_conversations (
  session_id TEXT    PRIMARY KEY,
  data       TEXT    NOT NULL,
  expires_at INTEGER NOT NULL
);
```

Custom table names are supported via options — see the full docs.

## Documentation

[Full docs →](https://aibind.dev/integrations/sqlite)
