# @aibind/cloudflare

Cloudflare Workers adapters for `@aibind` — wraps [D1](https://developers.cloudflare.com/d1/) as a `SqliteClient` and provides a [KV](https://developers.cloudflare.com/kv/)-backed `ConversationStore`.

## Installation

::: code-group

```bash [pnpm]
pnpm add @aibind/cloudflare @aibind/sqlite
```

```bash [npm]
npm install @aibind/cloudflare @aibind/sqlite
```

```bash [bun]
bun add @aibind/cloudflare @aibind/sqlite
```

:::

`@aibind/sqlite` is a peer dependency — `wrapD1()` returns a `SqliteClient`, and you use `SqliteStreamStore`/`SqliteConversationStore` from that package.

## Required Schema (D1)

Create these tables in your D1 database before using the stream or conversation stores. Use `wrangler d1 execute` or Drizzle's D1 adapter:

```sql
-- Stream tables (required for SqliteStreamStore)
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

-- Conversation table (required for SqliteConversationStore)
CREATE TABLE aibind_conversations (
  session_id TEXT    PRIMARY KEY,
  data       TEXT    NOT NULL,
  expires_at INTEGER NOT NULL
);
```

Apply with `wrangler`:

```bash
wrangler d1 execute MY_DB --file=./schema.sql
```

## wrapD1 — D1 as a StreamStore

`wrapD1()` converts a D1 binding to the `SqliteClient` interface, letting you use `SqliteStreamStore` and `SqliteConversationStore` directly. D1's `batch()` runs atomically in a single implicit transaction.

```ts
import { wrapD1 } from "@aibind/cloudflare";
import { SqliteStreamStore, SqliteConversationStore } from "@aibind/sqlite";

export default {
  async fetch(request: Request, env: Env) {
    const db = wrapD1(env.DB);

    const streamStore = new SqliteStreamStore(db);
    const conversationStore = new SqliteConversationStore(db);

    // Use with your framework's stream handler
  },
} satisfies ExportedHandler<Env>;
```

Declare the D1 binding in `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "my-db"
database_id = "..."
```

## KVConversationStore — conversations in KV

KV is ideal for conversation storage: single-key reads are fast globally and entries expire automatically via `expirationTtl` — no cleanup cron needed.

```ts
import { KVConversationStore } from "@aibind/cloudflare";

export default {
  async fetch(request: Request, env: Env) {
    const store = new KVConversationStore(env.CONVERSATIONS);

    // load, save, delete sessions
  },
} satisfies ExportedHandler<Env>;
```

Declare the KV namespace in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "CONVERSATIONS"
id = "..."
```

## Using both in a full Worker

```ts
import { wrapD1, KVConversationStore } from "@aibind/cloudflare";
import { SqliteStreamStore } from "@aibind/sqlite";

export default {
  async fetch(request: Request, env: Env) {
    const db = wrapD1(env.DB);

    // D1 for durable streams (ordered, resumable)
    const streamStore = new SqliteStreamStore(db);

    // KV for conversation history (fast key-value, auto-expiry)
    const conversationStore = new KVConversationStore(env.CONVERSATIONS);

    // Both are standard StreamStore / ConversationStore — pass to any handler
  },
} satisfies ExportedHandler<Env>;
```

## Options reference

**`KVConversationStore`**

| Option   | Type     | Default         | Description                                 |
| -------- | -------- | --------------- | ------------------------------------------- |
| `prefix` | `string` | `"aibind:conv"` | Key prefix for all KV entries               |
| `ttlSec` | `number` | `1800`          | TTL in seconds (maps to KV `expirationTtl`) |

For `SqliteStreamStore` and `SqliteConversationStore` options (custom table names, TTL, poll interval), see the [`@aibind/sqlite` docs](/integrations/sqlite).

## How wrapD1 works

D1's API is similar to SQLite but async and slightly different:

```ts
// D1 native
const result = await env.DB.prepare("SELECT ...").bind(arg1).all();
// result.results: Row[]

// After wrapD1
const result = await db.execute({ sql: "SELECT ...", args: [arg1] });
// result.rows: Row[]
```

`wrapD1` translates `execute()` and `batch()` calls to D1's `.prepare().bind().all()` and `.batch()` methods. D1 `batch()` is transactional, so `SqliteStreamStore`'s atomic `append()` works correctly.
