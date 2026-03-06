# Pattern: Resumable Chat

Stream a long response, close the tab or lose connection mid-way, then pick up exactly where it left off.

```svelte
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";

  // Server must use resumable: true (see server setup below)
  const stream = new Stream({ model: "smart" });
</script>

<button onclick={() => stream.send("Write a detailed analysis...")}>Send</button
>

<!-- Stop saves server-side; resume continues from last byte -->
{#if stream.loading}
  <button onclick={() => stream.stop()}>Stop</button>
{/if}

{#if stream.canResume}
  <button onclick={() => stream.resume()}>Resume</button>
{/if}

<p class="status">{stream.status}</p>
<p>{stream.text}</p>
```

## Server Setup

Enable resumable streams with one option on the handler:

```ts
// hooks.server.ts (SvelteKit) | app/api/ai/[...path]/route.ts (Next.js)
import { createStreamHandler } from "@aibind/sveltekit/server";
import { MemoryStreamStore } from "@aibind/core";

export const handle = createStreamHandler({
  models,
  store: new MemoryStreamStore(), // swap for Redis in production
  resumable: true,
});
```

## Key Patterns

### Status-driven UI

`stream.status` drives the full UI state machine:

```svelte
{#if stream.status === "streaming"}
  <button onclick={() => stream.stop()}>Pause</button>
{:else if stream.status === "stopped"}
  <button onclick={() => stream.resume()}>Continue</button>
{:else if stream.status === "disconnected"}
  <!-- Auto-reconnect exhausted — manual resume available -->
  <button onclick={() => stream.resume()}>Reconnect</button>
{:else if stream.status === "done"}
  <button onclick={() => stream.retry()}>Regenerate</button>
{/if}
```

The full status lifecycle: `idle → streaming → stopped | reconnecting → disconnected | done`

### Auto-reconnect on network drop

If the connection drops mid-stream, the client automatically retries up to 3 times with exponential backoff. Status transitions to `"disconnected"` only after all retries are exhausted — at which point `canResume` becomes `true`.

### Production store

`MemoryStreamStore` is for development. Use a persistent store in production so resumed streams survive server restarts:

```ts
import { RedisStreamStore } from "@aibind/redis"; // community package

export const handle = createStreamHandler({
  models,
  store: new RedisStreamStore({ url: process.env.REDIS_URL }),
  resumable: true,
});
```

### Persist stream ID

To resume after a full page reload, persist `stream.streamId`:

```svelte
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";

  const stream = new Stream({ model: "smart" });

  // Save stream ID when it changes
  $effect(() => {
    if (stream.streamId) sessionStorage.setItem("sid", stream.streamId);
  });
</script>
```
