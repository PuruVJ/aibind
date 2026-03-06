# Conversation Store

By default, every `send()` call is stateless — the server calls `streamText({ prompt })` with no history. `ConversationStore` gives the server memory: each request loads the session's prior messages, calls `streamText({ messages })`, and saves the result back.

## How It Works

1. Client sends `sessionId` alongside every request
2. Server loads the session's `ChatHistory` from the store
3. Server calls `streamText({ messages: [...history, newUserMessage] })`
4. On finish, server appends both messages and saves back

The `ChatHistory` used server-side is the same class used client-side — only reactivity differs.

## Server Setup

::: code-group

```ts [SvelteKit]
// src/hooks.server.ts
import {
  createStreamHandler,
  MemoryConversationStore,
} from "@aibind/sveltekit/server";
import { models } from "./models.server";

export const handle = createStreamHandler({
  models,
  conversation: {
    store: new MemoryConversationStore(), // 30-minute TTL by default
  },
});
```

```ts [Next.js]
// app/api/ai/[...path]/route.ts
import {
  createStreamHandler,
  MemoryConversationStore,
} from "@aibind/nextjs/server";
import { models } from "@/lib/models.server";

const handler = createStreamHandler({
  models,
  conversation: { store: new MemoryConversationStore() },
});

export const POST = (request: Request) => handler(request);
export const GET = (request: Request) => handler(request);
```

```ts [Nuxt]
// server/plugins/ai.ts
import {
  createStreamHandler,
  MemoryConversationStore,
} from "@aibind/nuxt/server";
import { models } from "~/server/models";

const handler = createStreamHandler({
  models,
  conversation: { store: new MemoryConversationStore() },
});

export default defineNitroPlugin((nitro) => {
  nitro.router.use("/__aibind__/**", (event) => handler(event.node.req as any));
});
```

```ts [SolidStart]
// src/server/ai.ts
import {
  createStreamHandler,
  MemoryConversationStore,
} from "@aibind/solidstart/server";
import { models } from "~/server/models";

export const handler = createStreamHandler({
  models,
  conversation: { store: new MemoryConversationStore() },
});
```

```ts [TanStack Start]
// src/routes/api/ai/$.ts
import {
  createStreamHandler,
  MemoryConversationStore,
} from "@aibind/tanstack-start/server";
import { models } from "~/lib/models.server";

const handler = createStreamHandler({
  models,
  conversation: { store: new MemoryConversationStore() },
});

export async function POST({ request }: { request: Request }) {
  return handler(request);
}
```

:::

### Custom Store (Redis, Postgres, KV, ...)

Implement the `ConversationStore` interface:

```ts
import type { ConversationStore, ConversationMessage } from "@aibind/core";
import type { ChatHistory } from "@aibind/sveltekit/history";

class RedisConversationStore implements ConversationStore {
  async load(sessionId: string): Promise<ChatHistory<ConversationMessage>> {
    const json = await redis.get(`conv:${sessionId}`);
    return json ? ChatHistory.fromJSON(json) : new ChatHistory();
  }

  async save(
    sessionId: string,
    chat: ChatHistory<ConversationMessage>,
  ): Promise<void> {
    await redis.setex(`conv:${sessionId}`, 1800, chat.toJSON());
  }

  async delete(sessionId: string): Promise<void> {
    await redis.del(`conv:${sessionId}`);
  }
}
```

### Sliding Window

Limit context to the last N message pairs:

```ts
createStreamHandler({
  models,
  conversation: {
    store: new MemoryConversationStore(),
    maxMessages: 20, // keep last 20 messages
  },
});
```

## Client Setup

Pass `sessionId` once when creating the stream. All subsequent `send()` calls automatically include it.

::: code-group

```svelte [SvelteKit]
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";

  const stream = new Stream({
    model: "fast",
    sessionId: crypto.randomUUID(), // generate once per conversation
  });
</script>

<button onclick={() => stream.send("What is 2+2?")}>Send</button>
<button onclick={() => stream.send("What did I just ask?")}>Ask again</button>
<p>{stream.text}</p>
```

```tsx [Next.js]
"use client";

import { useStream } from "@aibind/nextjs";
import { useState } from "react";

const SESSION_ID = crypto.randomUUID();

export default function Chat() {
  const { text, loading, send } = useStream({
    model: "fast",
    sessionId: SESSION_ID,
  });

  return (
    <div>
      <button onClick={() => send("What is 2+2?")}>Send</button>
      <button onClick={() => send("What did I just ask?")}>Ask again</button>
      <p>{text}</p>
    </div>
  );
}
```

```vue [Nuxt]
<script setup lang="ts">
import { useStream } from "@aibind/nuxt";

const { text, loading, send } = useStream({
  model: "fast",
  sessionId: crypto.randomUUID(),
});
</script>

<template>
  <button @click="send('What is 2+2?')">Send</button>
  <button @click="send('What did I just ask?')">Ask again</button>
  <p>{{ text }}</p>
</template>
```

```tsx [SolidStart]
import { useStream } from "@aibind/solidstart";

const SESSION_ID = crypto.randomUUID();

function Chat() {
  const { text, loading, send } = useStream({
    model: "fast",
    sessionId: SESSION_ID,
  });

  return (
    <div>
      <button onClick={() => send("What is 2+2?")}>Send</button>
      <p>{text()}</p>
    </div>
  );
}
```

```tsx [TanStack Start]
import { useStream } from "@aibind/tanstack-start";

const SESSION_ID = crypto.randomUUID();

function Chat() {
  const { text, loading, send } = useStream({
    model: "fast",
    sessionId: SESSION_ID,
  });

  return (
    <div>
      <button onClick={() => send("What is 2+2?")}>Send</button>
      <button onClick={() => send("What did I just ask?")}>Ask again</button>
      <p>{text}</p>
    </div>
  );
}
```

:::

## Session ID Management

You are responsible for generating and persisting `sessionId`. Common patterns:

```ts
// New conversation per page load
const sessionId = crypto.randomUUID();

// Persistent across reloads
const sessionId =
  localStorage.getItem("sessionId") ??
  (() => {
    const id = crypto.randomUUID();
    localStorage.setItem("sessionId", id);
    return id;
  })();

// Per-user (server-generated, stored in DB)
const sessionId = `user-${userId}-conv-${convId}`;
```

## ConversationStore Interface

```ts
interface ConversationStore {
  /** Load conversation. Returns empty ChatHistory if session not found. */
  load(sessionId: string): Promise<ChatHistory<ConversationMessage>>;
  /** Persist the conversation. */
  save(
    sessionId: string,
    chat: ChatHistory<ConversationMessage>,
  ): Promise<void>;
  /** Delete a session. */
  delete(sessionId: string): Promise<void>;
}

interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
}
```

## MemoryConversationStore

Built-in store backed by a `Map`. Suitable for development and single-server deployments.

```ts
import { MemoryConversationStore } from "@aibind/core";

const store = new MemoryConversationStore({
  ttlMs: 30 * 60 * 1000, // 30 minutes (default)
});
```

Sessions expire automatically after TTL ms of inactivity. The TTL resets on every `save()`.

## StreamHandlerConfig Options

```ts
createStreamHandler({
  models,
  conversation: {
    store: new MemoryConversationStore(),
    maxMessages?: number,       // sliding window on active path
    compactSystemPrompt?: string, // used by /compact endpoint (see Compacting)
  },
});
```
