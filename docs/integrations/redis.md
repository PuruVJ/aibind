# @aibind/redis

Redis-backed `StreamStore` and `ConversationStore`. Compatible with [ioredis](https://github.com/redis/ioredis), [node-redis](https://github.com/redis/node-redis), [Upstash](https://upstash.com), or any client that exposes the `RedisClient` interface.

## Installation

::: code-group

```bash [pnpm]
pnpm add @aibind/redis
```

```bash [npm]
npm install @aibind/redis
```

```bash [bun]
bun add @aibind/redis
```

:::

## Setup

### With ioredis

```ts
import { Redis } from "ioredis";
import { RedisStreamStore, RedisConversationStore } from "@aibind/redis";

const redis = new Redis(process.env.REDIS_URL!);

const streamStore = new RedisStreamStore(redis);
const conversationStore = new RedisConversationStore(redis);
```

### With Upstash

```ts
import { Redis } from "@upstash/redis";
import { RedisStreamStore, RedisConversationStore } from "@aibind/redis";

const redis = new Redis({
  url: process.env.UPSTASH_URL!,
  token: process.env.UPSTASH_TOKEN!,
});

const streamStore = new RedisStreamStore(redis);
const conversationStore = new RedisConversationStore(redis);
```

### With node-redis

```ts
import { createClient } from "redis";
import { RedisStreamStore } from "@aibind/redis";

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const streamStore = new RedisStreamStore(redis);
```

## Usage

### Durable streams

```ts
import { createStreamHandler } from "@aibind/sveltekit/server";
import { RedisStreamStore } from "@aibind/redis";

const store = new RedisStreamStore(redis);

export const handle = createStreamHandler({
  models,
  store,
  resumable: true,
});
```

### Conversation history

```ts
import { createStreamHandler } from "@aibind/sveltekit/server";
import { RedisConversationStore } from "@aibind/redis";

const store = new RedisConversationStore(redis);

export const handle = createStreamHandler({
  models,
  conversation: { store },
});
```

### Share one connection

Both stores accept the same `RedisClient` — pass the same instance to avoid maintaining two connections:

```ts
const redis = new Redis(process.env.REDIS_URL!);

const streamStore = new RedisStreamStore(redis);
const conversationStore = new RedisConversationStore(redis);
```

## Options reference

**`RedisStreamStore`**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `prefix` | `string` | `"aibind:stream"` | Key prefix for all stream keys |
| `pollIntervalMs` | `number` | `50` | How often to poll for new chunks in `readFrom()` |
| `ttlSec` | `number` | `300` | TTL in seconds for completed stream keys |

**`RedisConversationStore`**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `prefix` | `string` | `"aibind:conv"` | Key prefix for all conversation keys |
| `ttlSec` | `number` | `1800` | TTL in seconds for conversation keys |

## Key schema

`RedisStreamStore` uses these keys per stream (where `{id}` is the stream ID):

| Key | Type | Description |
|-----|------|-------------|
| `{prefix}:{id}:status` | String (JSON) | Stream state, total chunk count |
| `{prefix}:{id}:chunks` | List | Ordered chunk data |

`RedisConversationStore` stores serialized `ChatHistory` JSON at `{prefix}:{sessionId}` with an EX TTL.

## RedisClient interface

`@aibind/redis` defines a minimal structural interface — any client that implements these 8 methods works:

```ts
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, exArg: "EX", ttl: number): Promise<unknown>;
  exists(...keys: string[]): Promise<number>;
  rpush(key: string, ...values: string[]): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  llen(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
}
```

No import from `ioredis` or `redis` — bring your own client.
