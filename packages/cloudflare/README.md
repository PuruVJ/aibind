# @aibind/cloudflare

Cloudflare Workers adapters for `@aibind` — wraps [D1](https://developers.cloudflare.com/d1/) as a `SqliteClient` (for use with `@aibind/sqlite`) and provides a [KV](https://developers.cloudflare.com/kv/)-backed `ConversationStore`.

## Install

```bash
npm install @aibind/cloudflare @aibind/sqlite
```

## Usage

```ts
import { wrapD1, KVConversationStore } from "@aibind/cloudflare";
import { SqliteStreamStore } from "@aibind/sqlite";

export default {
  async fetch(request: Request, env: Env) {
    // D1 for durable streams (ordered chunks, resumable)
    const streamStore = new SqliteStreamStore(wrapD1(env.DB));

    // KV for conversation history (global low-latency, auto-expiry)
    const conversationStore = new KVConversationStore(env.CONVERSATIONS);
  },
} satisfies ExportedHandler<Env>;
```

## Required D1 schema

**You must create these tables yourself** before using `SqliteStreamStore`:

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

-- Only needed if using SqliteConversationStore with D1
CREATE TABLE aibind_conversations (
  session_id TEXT    PRIMARY KEY,
  data       TEXT    NOT NULL,
  expires_at INTEGER NOT NULL
);
```

Apply with wrangler: `wrangler d1 execute MY_DB --file=./schema.sql`

`KVConversationStore` requires no schema — KV is a simple key-value store.

## wrangler.toml

```toml
[[d1_databases]]
binding = "DB"
database_name = "my-db"
database_id = "..."

[[kv_namespaces]]
binding = "CONVERSATIONS"
id = "..."
```

## Documentation

[Full docs →](https://aibind.dev/integrations/cloudflare)
