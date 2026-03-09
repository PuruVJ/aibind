# @aibind/postgres

PostgreSQL-backed `StreamStore` and `ConversationStore` for `@aibind`. Works with [`pg`](https://node-postgres.com) (node-postgres), [`postgres.js`](https://github.com/porsager/postgres), [Neon](https://neon.tech), [Supabase](https://supabase.com), [Vercel Postgres](https://vercel.com/storage/postgres), and any compatible client.

## Install

```bash
npm install @aibind/postgres
```

## Usage

```ts
// pg (node-postgres) — implements PostgresClient directly
import { Pool } from "pg";
import {
  PostgresStreamStore,
  PostgresConversationStore,
} from "@aibind/postgres";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const streamStore = new PostgresStreamStore(pool);
const conversationStore = new PostgresConversationStore(pool);
```

```ts
// Neon serverless
import { neon } from "@neondatabase/serverless";
import { wrapNeon, PostgresStreamStore } from "@aibind/postgres";

const store = new PostgresStreamStore(
  wrapNeon(neon(process.env.DATABASE_URL!)),
);
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
  expires_at   BIGINT  NOT NULL
);

CREATE TABLE aibind_conversations (
  session_id TEXT   PRIMARY KEY,
  data       TEXT   NOT NULL,
  expires_at BIGINT NOT NULL
);
```

Custom table names are supported via options — see the full docs.

## Documentation

[Full docs →](https://aibind.dev/integrations/postgres)
