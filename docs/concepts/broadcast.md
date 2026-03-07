# Cross-tab Stream Sync

Stream a response once, display it everywhere — across multiple browser tabs, windows, or PWA instances — with zero extra server requests.

## The problem it solves

When a user has your app open in multiple places (desktop + phone, two browser windows, a chat tab + a fullscreen reader), each `Stream` instance makes its own HTTP request. Cross-tab sync lets one tab own the HTTP connection and broadcast its state to all others via the browser's native [`BroadcastChannel` API](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel).

**This is not for general chat history sync.** Chat history (past messages) should come from your database via normal data loading. This is specifically for the live streaming state — the text appearing token-by-token right now.

## When to use it

| Use case | Good fit? |
|----------|-----------|
| Desktop tab + phone PWA, same active stream | Yes |
| Two windows: chat input + fullscreen reader | Yes |
| Presentation: control tab + projector display | Yes |
| Background progress widget in another tab | Yes |
| Syncing past conversation history | No — use your DB |
| Real-time collaboration between different users | No — use WebSockets |

## How it works

Two primitives, one channel name:

| | Source page | Mirror page |
|-|-------------|-------------|
| **Svelte** | `Stream` + `stream.broadcast(name)` | `new StreamMirror(name)` |
| **React** | `useStream` + `broadcast(name)` | `useStreamMirror(name)` |
| **Vue** | `useStream` + `broadcast(name)` | `useStreamMirror(name)` |
| **Solid** | `useStream` + `broadcast(name)` | `useStreamMirror(name)` |

The source owns the HTTP connection and broadcasts its state on every chunk. Mirrors listen and update reactively — no additional requests. The channel name is the only shared identifier; pick something session-specific (e.g. a user or session ID) so independent streams don't cross-talk.

## Source page

The page where the user types and sends. Owns the HTTP connection.

::: code-group

```svelte [SvelteKit]
<!-- src/routes/chat/+page.svelte -->
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";

  const stream = new Stream({ model: "smart" });

  // Broadcast to any tab listening on this channel name.
  // Auto-stops when this component is destroyed.
  stream.broadcast("my-chat-session");

  let input = $state("");
</script>

<form onsubmit={(e) => { e.preventDefault(); stream.send(input); input = ""; }}>
  <input bind:value={input} placeholder="Ask something…" />
  <button>Send</button>
</form>

<p>{stream.text}</p>
```

```tsx [Next.js / React]
"use client";
import { useStream } from "@aibind/nextjs"; // or @aibind/react
import { useEffect, useState } from "react";

export default function ChatPage() {
  const { text, send, broadcast } = useStream({ model: "smart" });
  const [input, setInput] = useState("");

  useEffect(() => {
    broadcast("my-chat-session");
  }, []);

  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); send(input); setInput(""); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} />
        <button>Send</button>
      </form>
      <p>{text}</p>
    </>
  );
}
```

```vue [Nuxt / Vue]
<script setup lang="ts">
import { useStream } from "@aibind/nuxt"; // or @aibind/vue
import { ref, onMounted } from "vue";

const { text, send, broadcast } = useStream({ model: "smart" });
const input = ref("");

onMounted(() => broadcast("my-chat-session"));
</script>

<template>
  <form @submit.prevent="send(input); input = ''">
    <input v-model="input" placeholder="Ask something…" />
    <button>Send</button>
  </form>
  <p>{{ text }}</p>
</template>
```

```tsx [SolidStart / Solid]
import { useStream } from "@aibind/solidstart"; // or @aibind/solid
import { createSignal, onMount } from "solid-js";

export default function ChatPage() {
  const { text, send, broadcast } = useStream({ model: "smart" });
  const [input, setInput] = createSignal("");

  onMount(() => broadcast("my-chat-session"));

  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); send(input()); setInput(""); }}>
        <input value={input()} onInput={(e) => setInput(e.currentTarget.value)} />
        <button>Send</button>
      </form>
      <p>{text()}</p>
    </>
  );
}
```

:::

## Mirror page

Any other page that should display the same stream. Makes no HTTP request.

::: code-group

```svelte [SvelteKit]
<!-- src/routes/reader/+page.svelte -->
<script lang="ts">
  import { StreamMirror } from "@aibind/sveltekit";

  // Same channel name as the source — that's the only connection between them.
  const mirror = new StreamMirror("my-chat-session");
  // Lifecycle is tied to this component — channel closes on destroy automatically.
</script>

{#if mirror.loading}
  <p class="status">Generating…</p>
{/if}

<p>{mirror.text}</p>
```

```tsx [Next.js / React]
import { useStreamMirror } from "@aibind/nextjs"; // or @aibind/react

export default function ReaderPage() {
  const mirror = useStreamMirror("my-chat-session");

  return (
    <>
      {mirror.loading && <p className="status">Generating…</p>}
      <p>{mirror.text}</p>
    </>
  );
}
```

```vue [Nuxt / Vue]
<script setup lang="ts">
import { useStreamMirror } from "@aibind/nuxt"; // or @aibind/vue

const mirror = useStreamMirror("my-chat-session");
</script>

<template>
  <p v-if="mirror.loading" class="status">Generating…</p>
  <p>{{ mirror.text }}</p>
</template>
```

```tsx [SolidStart / Solid]
import { useStreamMirror } from "@aibind/solidstart"; // or @aibind/solid

export default function ReaderPage() {
  const mirror = useStreamMirror("my-chat-session");

  return (
    <>
      {mirror.loading() && <p class="status">Generating…</p>}
      <p>{mirror.text()}</p>
    </>
  );
}
```

:::

The mirror exposes the same reactive fields as the source for display:

```ts
mirror.text     // string — accumulates as source streams
mirror.status   // StreamStatus — "idle" | "streaming" | "done" | "error" | …
mirror.loading  // boolean
mirror.done     // boolean
mirror.error    // string | null
```


## Recipes

### Presentation mode

One tab controls, another displays on a projector or second monitor.

```svelte
<!-- /present — fullscreen display tab -->
<script lang="ts">
  import { StreamMirror } from "@aibind/sveltekit";
  const mirror = new StreamMirror("presentation");
</script>

<div class="fullscreen">
  <p class="large-text">{mirror.text}</p>
  {#if mirror.loading}<span class="cursor">▋</span>{/if}
</div>
```

```svelte
<!-- /control — operator tab -->
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";
  const stream = new Stream({ model: "smart" });
  stream.broadcast("presentation");
</script>

<input placeholder="Type prompt for audience…" />
<button onclick={() => stream.send(input)}>Send to display</button>
```

### Background progress widget

Fire off a long generation, switch tabs — a floating widget in another tab shows live progress.

```svelte
<!-- ProgressWidget.svelte — mounted in a persistent layout -->
<script lang="ts">
  import { StreamMirror } from "@aibind/sveltekit";
  const mirror = new StreamMirror("active-generation");
</script>

{#if mirror.loading}
  <div class="floating-progress">
    Generating… {mirror.text.split(" ").length} words
  </div>
{/if}
```

```svelte
<!-- Main chat page -->
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";
  const stream = new Stream({ model: "smart" });
  stream.broadcast("active-generation");
</script>
```

### Dynamic channel (per-session)

Use a session or user ID as the channel name so multiple independent streams don't collide.

```svelte
<!-- Source -->
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";
  let { sessionId } = $props<{ sessionId: string }>();

  const stream = new Stream({ model: "smart" });
  stream.broadcast(`chat:${sessionId}`);
</script>
```

```svelte
<!-- Mirror -->
<script lang="ts">
  import { StreamMirror } from "@aibind/sveltekit";
  let { sessionId } = $props<{ sessionId: string }>();

  const mirror = new StreamMirror(`chat:${sessionId}`);
</script>
```

## How it works

`stream.broadcast(channelName)` opens a [`BroadcastChannel`](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel) and posts the full current state (`text`, `status`, `loading`, `done`, `error`) on every internal state change — each chunk received, each status transition, each error. Late-joining mirrors receive the full state on the next update.

`StreamMirror` opens the same channel and updates its reactive fields on each message. No HTTP request is made.

Both sides close their `BroadcastChannel` automatically when their component is destroyed (via `onDestroy`).

::: warning Same-origin only
`BroadcastChannel` is same-origin: source and mirror must be on the same protocol, host, and port. It does not work across different domains or from server-rendered pages (SSR).
:::
