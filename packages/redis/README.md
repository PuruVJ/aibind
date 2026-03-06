# @aibind/redis

Redis-backed `StreamStore` and `ConversationStore` for `@aibind`. Works with [ioredis](https://github.com/redis/ioredis), [Upstash](https://upstash.com), [node-redis](https://github.com/redis/node-redis), or any client that implements the minimal `RedisClient` interface.

## Install

```bash
npm install @aibind/redis
```

## Usage

```ts
import { Redis } from "ioredis";
import { RedisStreamStore, RedisConversationStore } from "@aibind/redis";

const redis = new Redis(process.env.REDIS_URL!);

// Durable streams (stop + resume)
const streamStore = new RedisStreamStore(redis);

// Server-side conversation history
const conversationStore = new RedisConversationStore(redis);
```

Pass to your framework's stream handler:

```ts
import { createStreamHandler } from "@aibind/sveltekit/server";

export const handle = createStreamHandler({
  models,
  store: streamStore,          // enables durable streams
  conversation: { store: conversationStore }, // enables multi-turn history
});
```

## Clients

Any client with this shape works — no hard dependency on any specific Redis library:

```ts
interface RedisClient {
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

## Documentation

[Full docs →](https://aibind.dev/integrations/redis)
