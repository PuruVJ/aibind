# Compacting

As conversations grow, the context window fills up and costs increase. Compacting replaces the full message history with a single AI-generated summary, preserving all important context while dramatically reducing token usage.

This is the same technique Claude Code uses when you see "167k tokens freed."

## How It Works

1. Call `stream.compact(chat)` — sends the message history to `POST /__aibind__/compact`
2. Server uses `generateText` to summarize all messages into one dense paragraph
3. Client history is updated automatically — the tree is cleared, summary inserted as the only node
4. Future turns continue with the summary as prior context

The summary is a system message, so the AI treats it as background context, not a conversation turn.

## Server Setup

Compacting requires `ConversationStore` to be configured (so the server can update the stored session too):

```ts
import {
  createStreamHandler,
  MemoryConversationStore,
} from "@aibind/sveltekit/server";

export const handle = createStreamHandler({
  models,
  conversation: {
    store: new MemoryConversationStore(),
    compactSystemPrompt: `Summarize this conversation into a single dense paragraph that
preserves all decisions, facts, and preferences. This will replace the full history.`,
  },
});
```

If `compactSystemPrompt` is omitted, a default summarization prompt is used.

## Client Usage

::: code-group

```svelte [SvelteKit]
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";
  import { ChatHistory } from "@aibind/sveltekit/history";
  import type { ConversationMessage } from "@aibind/core";

  const chat = new ChatHistory<ConversationMessage>();
  const stream = new Stream({ model: "fast", sessionId: crypto.randomUUID() });

  let tokensSaved = $state(0);

  async function compact() {
    const { tokensSaved: saved } = await stream.compact(chat);
    tokensSaved = saved;
  }
</script>

<button onclick={compact} disabled={chat.size < 10}>Compact history</button>
<p>Messages: {chat.size}</p>
{#if tokensSaved > 0}<p>{tokensSaved.toLocaleString()} tokens freed</p>{/if}
```

```tsx [Next.js]
"use client";

import { useStream } from "@aibind/nextjs";
import { ChatHistory } from "@aibind/nextjs/history";
import type { ConversationMessage } from "@aibind/core";
import { useState } from "react";

const chat = new ChatHistory<ConversationMessage>();

export default function Chat() {
  const { text, send, compact } = useStream({ model: "fast", sessionId: crypto.randomUUID() });
  const [tokensSaved, setTokensSaved] = useState(0);

  async function handleCompact() {
    const { tokensSaved: saved } = await compact(chat);
    setTokensSaved(saved);
  }

  return (
    <div>
      <p>Messages: {chat.messages.length}</p>
      <button onClick={handleCompact} disabled={chat.messages.length < 10}>
        Compact history
      </button>
      {tokensSaved > 0 && <p>{tokensSaved.toLocaleString()} tokens freed</p>}
      <p>{text}</p>
    </div>
  );
}
```

```vue [Nuxt]
<script setup lang="ts">
import { useStream } from "@aibind/nuxt";
import { ChatHistory } from "@aibind/nuxt/history";
import type { ConversationMessage } from "@aibind/core";
import { ref } from "vue";

const chat = new ChatHistory<ConversationMessage>();
const { text, send, compact } = useStream({ model: "fast", sessionId: crypto.randomUUID() });
const tokensSaved = ref(0);

async function handleCompact() {
  const { tokensSaved: saved } = await compact(chat);
  tokensSaved.value = saved;
}
</script>

<template>
  <p>Messages: {{ chat.messages.length }}</p>
  <button @click="handleCompact" :disabled="chat.messages.length < 10">
    Compact history
  </button>
  <p v-if="tokensSaved > 0">{{ tokensSaved.toLocaleString() }} tokens freed</p>
  <p>{{ text }}</p>
</template>
```

```tsx [SolidStart]
import { useStream } from "@aibind/solidstart";
import { ChatHistory } from "@aibind/solidstart/history";
import type { ConversationMessage } from "@aibind/core";
import { createSignal } from "solid-js";

const chat = new ChatHistory<ConversationMessage>();

function Chat() {
  const { text, send, compact } = useStream({ model: "fast", sessionId: crypto.randomUUID() });
  const [tokensSaved, setTokensSaved] = createSignal(0);

  async function handleCompact() {
    const { tokensSaved: saved } = await compact(chat);
    setTokensSaved(saved);
  }

  return (
    <div>
      <p>Messages: {chat.messages.length}</p>
      <button onClick={handleCompact} disabled={chat.messages.length < 10}>
        Compact history
      </button>
      {tokensSaved() > 0 && <p>{tokensSaved().toLocaleString()} tokens freed</p>}
      <p>{text()}</p>
    </div>
  );
}
```

```tsx [TanStack Start]
import { useStream } from "@aibind/tanstack-start";
import { ChatHistory } from "@aibind/tanstack-start/history";
import type { ConversationMessage } from "@aibind/core";
import { useState } from "react";

const chat = new ChatHistory<ConversationMessage>();

function Chat() {
  const { text, send, compact } = useStream({ model: "fast", sessionId: crypto.randomUUID() });
  const [tokensSaved, setTokensSaved] = useState(0);

  async function handleCompact() {
    const { tokensSaved: saved } = await compact(chat);
    setTokensSaved(saved);
  }

  return (
    <div>
      <p>Messages: {chat.messages.length}</p>
      <button onClick={handleCompact} disabled={chat.messages.length < 10}>
        Compact history
      </button>
      {tokensSaved > 0 && <p>{tokensSaved.toLocaleString()} tokens freed</p>}
      <p>{text}</p>
    </div>
  );
}
```

:::

## Low-level: Manual fetch

For non-stream contexts (scripts, server-side, or when you need to control the request manually):

```ts
const res = await fetch("/__aibind__/compact", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages: chat.messages, sessionId }),
});
const { summary, tokensSaved } = await res.json();
chat.compact({ role: "system", content: summary });
```

## ChatHistory.compact()

```ts
chat.compact(summary: M): void
```

Clears the entire message tree and inserts `summary` as the single root node. The node is tagged with `{ compacted: true, compactedAt: ISO_STRING }` metadata.

After compacting:

- `chat.messages` returns `[summary]`
- `chat.size` is `1`
- All branches are gone — the history is linear again

## /compact Endpoint

`POST /__aibind__/compact`

**Request body:**

```json
{
  "messages": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi there!" }
  ],
  "model": "fast",
  "sessionId": "optional-session-id"
}
```

**Response:**

```json
{
  "summary": "The user greeted the assistant...",
  "tokensSaved": 4821
}
```

`tokensSaved` is `inputTokens - outputTokens` from the summarization call — roughly how many fewer tokens future requests will need to carry.

If `sessionId` is provided and a `ConversationStore` is configured, the server also calls `chat.compact()` on the stored session — keeping client and server in sync automatically.

## When to Compact

```ts
// Compact when history exceeds a threshold
if (chat.size > 50) {
  await compact();
}

// Or let the user trigger it manually
// Or compact on a timer / route change
```

Good thresholds depend on your model's context window and average message length. For most chat UIs, compacting at 40–80 messages is reasonable.
