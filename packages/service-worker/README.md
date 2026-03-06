# @aibind/service-worker

Run AI streaming with **zero server infrastructure** — the Service Worker is the backend.

`@aibind/service-worker` installs a fetch handler in your SW that intercepts `@aibind` requests and handles them entirely in the browser. The LLM API is called directly from the SW; conversation history and durable stream chunks are stored in IndexedDB.

The client-side `Stream` class (from `@aibind/svelte`, `@aibind/react`, etc.) sees the same SSE protocol as a normal server-backed setup — no changes needed.

## When to use this

- Personal tools and internal apps where an embedded API key is acceptable
- PWAs that need AI features without any backend
- Demos and prototypes where zero infrastructure matters
- Offline-capable apps (combined with caching strategies)

> **Note:** The API key will be visible in your SW source code. Only use this when that trade-off is intentional.

## Install

```bash
npm install @aibind/service-worker ai @openrouter/ai-sdk-provider
```

## Usage

### 1. Create your service worker

```ts
// sw.ts
import { createSWHandler, IDBStreamStore, IDBConversationStore } from "@aibind/service-worker";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({ apiKey: "sk-..." }); // user accepts key exposure

const handler = createSWHandler({
  models: {
    fast: openrouter("google/gemini-3.1-flash-lite-preview"),
    smart: openrouter("openai/gpt-5-mini"),
  },
  resumable: true,
  store: new IDBStreamStore(),
  conversation: {
    store: new IDBConversationStore(),
  },
});

self.addEventListener("fetch", handler);
```

### 2. Register the service worker in your app

```ts
// main.ts (or app entry point)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
```

### 3. Use Stream as normal

```svelte
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";
  const stream = new Stream({ model: "fast" });
</script>

<button onclick={() => stream.send("Hello!")}>Send</button>
<p>{stream.text}</p>
```

No changes to client code — the SW handles the request before it ever reaches the network.

## IndexedDB stores

### IDBStreamStore

Backs durable/resumable streams. Chunks are written to IndexedDB as they arrive and can be replayed if the page reloads mid-stream.

```ts
const store = new IDBStreamStore({
  dbName: "aibind_sw",        // IndexedDB database name
  pollIntervalMs: 50,          // how often readFrom() checks for new chunks
  ttlMs: 300_000,              // TTL for completed streams before cleanup
});
```

### IDBConversationStore

Persists conversation history per session. Preserves branching structure (edits, regenerations).

```ts
const store = new IDBConversationStore({
  dbName: "aibind_sw",        // IndexedDB database name
  ttlMs: 1_800_000,            // TTL for idle sessions (30 min default)
});
```

Both stores share the same IndexedDB database by default (`aibind_sw`). Tables are created automatically on first open — no schema setup required.

### Cleanup

Call `cleanup()` periodically to remove expired records:

```ts
// In your SW activate event
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([streamStore.cleanup(), conversationStore.cleanup()])
  );
});
```

## Options reference

**`createSWHandler(config)`** — accepts the same `StreamHandlerConfig` as server-side `createStreamHandler`, plus all model, conversation, and resumable options.

**`IDBStreamStore`**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dbName` | `string` | `"aibind_sw"` | IndexedDB database name |
| `pollIntervalMs` | `number` | `50` | Polling interval for readFrom() |
| `ttlMs` | `number` | `300_000` | TTL for completed streams |

**`IDBConversationStore`**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dbName` | `string` | `"aibind_sw"` | IndexedDB database name |
| `ttlMs` | `number` | `1_800_000` | TTL for idle sessions |

## Documentation

[Full docs →](https://aibind.dev/integrations/service-worker)
