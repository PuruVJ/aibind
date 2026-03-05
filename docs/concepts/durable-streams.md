# Durable Streams

Durable streams let you abort a running stream and resume it later without losing any data. This is useful for long AI responses where users might navigate away and come back.

## How It Works

1. Server assigns each stream a unique ID via SSE
2. Stream chunks are stored in a `StreamStore` (in-memory or custom)
3. When client calls `stop()`, the server pauses (not aborts) the stream
4. Client calls `resume()` — server replays missed chunks then continues

## Enabling Resumable Streams

### Server

```ts
// hooks.server.ts (SvelteKit)
import { createStreamHandler } from "@aibind/sveltekit/server";
import { models } from "./models.server";

export const handle = createStreamHandler({
  models,
  resumable: true, // Enable durable streams
});
```

### Client

#### SvelteKit

```svelte
<script lang="ts">
  import { Stream } from '@aibind/sveltekit';

  const stream = new Stream({ model: 'fast' });
</script>

<button onclick={() => stream.send('Write a long essay...')}>Start</button>

{#if stream.loading}
  <button onclick={() => stream.stop()}>Pause</button>
{/if}

{#if stream.canResume}
  <button onclick={() => stream.resume()}>Resume</button>
{/if}

<div>{stream.text}</div>
```

#### Next.js / React

```tsx
"use client";

import { useStream } from "@aibind/nextjs";

function DurableChat() {
  const { text, loading, canResume, send, stop, resume } = useStream({
    model: "fast",
  });

  return (
    <div>
      <button onClick={() => send("Write a long essay...")}>Start</button>
      {loading && <button onClick={stop}>Pause</button>}
      {canResume && <button onClick={resume}>Resume</button>}
      <div>{text}</div>
    </div>
  );
}
```

#### Nuxt / Vue

```vue
<script setup lang="ts">
import { useStream } from "@aibind/nuxt";

const { text, loading, canResume, send, stop, resume } = useStream({
  model: "fast",
});
</script>

<template>
  <button @click="send('Write a long essay...')">Start</button>
  <button v-if="loading" @click="stop()">Pause</button>
  <button v-if="canResume" @click="resume()">Resume</button>
  <div>{{ text }}</div>
</template>
```

#### SolidStart

```tsx
import { useStream } from "@aibind/solidstart";

function DurableChat() {
  const { text, loading, canResume, send, stop, resume } = useStream({
    model: "fast",
  });

  return (
    <div>
      <button onClick={() => send("Write a long essay...")}>Start</button>
      <Show when={loading()}>
        <button onClick={stop}>Pause</button>
      </Show>
      <Show when={canResume()}>
        <button onClick={resume}>Resume</button>
      </Show>
      <div>{text()}</div>
    </div>
  );
}
```

#### TanStack Start

```tsx
import { useStream } from "@aibind/tanstack-start";

function DurableChat() {
  const { text, loading, canResume, send, stop, resume } = useStream({
    model: "fast",
  });

  return (
    <div>
      <button onClick={() => send("Write a long essay...")}>Start</button>
      {loading && <button onClick={stop}>Pause</button>}
      {canResume && <button onClick={resume}>Resume</button>}
      <div>{text}</div>
    </div>
  );
}
```

## Stream Status

| Status      | Description               |
| ----------- | ------------------------- |
| `idle`      | No stream active          |
| `streaming` | Actively receiving chunks |
| `stopped`   | Paused, can be resumed    |
| `resuming`  | Replaying missed chunks   |

## Custom Stream Store

By default, streams are stored in memory. For production, implement a custom `StreamStore`:

```ts
import type { StreamStore, StreamChunk } from "@aibind/core";

class RedisStreamStore implements StreamStore {
  async append(streamId: string, chunk: StreamChunk) {
    /* ... */
  }
  async getChunks(streamId: string, afterIndex: number) {
    /* ... */
  }
  async getStatus(streamId: string) {
    /* ... */
  }
  async setStatus(streamId: string, status: DurableStreamStatus) {
    /* ... */
  }
}
```
