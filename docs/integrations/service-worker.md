# @aibind/service-worker

Run AI streaming with **zero server infrastructure** — the Service Worker is the backend.

`@aibind/service-worker` installs a fetch handler that intercepts `@aibind` streaming requests and handles them entirely inside the browser. The LLM API is called directly from the SW; conversation history and resumable stream chunks are stored in IndexedDB.

The client-side `Stream` class sees the same SSE protocol as a normal server-backed setup — no client code changes required.

## When to use this

- **Personal tools / internal apps** — you control who sees the source, key exposure is acceptable
- **Zero-infrastructure PWAs** — no backend, no server costs
- **Prototypes and demos** — ship fast without a backend
- **Offline-capable AI** — combine with a caching strategy for fully offline responses

::: warning API key exposure
The API key lives in your SW source file, which is client-side JavaScript. Anyone who opens DevTools can read it. Only use `@aibind/service-worker` when this trade-off is intentional and acceptable for your use case.
:::

## Installation

::: code-group

```bash [npm]
npm install @aibind/service-worker ai @openrouter/ai-sdk-provider
```

```bash [pnpm]
pnpm add @aibind/service-worker ai @openrouter/ai-sdk-provider
```

```bash [bun]
bun add @aibind/service-worker ai @openrouter/ai-sdk-provider
```

:::

## Setup

### 1. Create your service worker file

```ts
// public/sw.ts  (or sw.js — depends on your bundler)
import { createSWHandler, IDBStreamStore, IDBConversationStore } from "@aibind/service-worker";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({ apiKey: "sk-..." });

const streamStore = new IDBStreamStore();
const conversationStore = new IDBConversationStore();

const handler = createSWHandler({
  models: {
    fast: openrouter("google/gemini-3.1-flash-lite-preview"),
    smart: openrouter("openai/gpt-5-mini"),
  },
  resumable: true,
  store: streamStore,
  conversation: {
    store: conversationStore,
  },
});

self.addEventListener("fetch", handler);

// Clean up expired records on every SW activation
self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    Promise.all([streamStore.cleanup(), conversationStore.cleanup()]),
  );
});
```

### 2. Register the SW in your app

```ts
// src/main.ts
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
```

### 3. Use Stream exactly as normal

```svelte
<script lang="ts">
  import { Stream } from "@aibind/svelte";

  type ModelKey = "fast" | "smart";
  const stream = new Stream<ModelKey>({ model: "fast" });
  let prompt = $state("");
</script>

<input bind:value={prompt} />
<button onclick={() => stream.send(prompt)}>Send</button>
<p>{stream.text}</p>
```

No changes to client code. The SW intercepts requests to `/__aibind__/*` before they reach the network and responds with a streaming SSE response.

## How it works

```
Browser page                   Service Worker              LLM API
──────────                     ──────────────              ───────
stream.send("Hello")
  → fetch /__aibind__/stream → (intercepted)
                                 streamText({ model })  →  OpenRouter
                                   ↓ chunks                  ↓
                                 IDBStreamStore.append()
                                 SSE response           ←  streaming
  ← SSE chunks ←────────────────────────────────────────────
stream.text = "Hello there!"
```

The SW tees every streaming response — one copy goes to the browser page, one is tracked to keep the SW alive via `event.waitUntil()` until the full stream is complete. This prevents the browser from killing the SW mid-stream.

## IndexedDB stores

Both stores live in the same IndexedDB database (`aibind_sw` by default) and auto-create their object stores on first open — no schema setup needed.

### IDBStreamStore

Backs resumable streams. Chunks are written to IDB as they arrive; clients that reconnect (tab reload, navigation) can resume from where they left off.

```ts
const store = new IDBStreamStore({
  dbName: "aibind_sw",    // IndexedDB database name
  pollIntervalMs: 50,     // how often readFrom() polls for new chunks
  ttlMs: 300_000,         // 5 minutes — how long to keep completed streams
});
```

### IDBConversationStore

Persists multi-turn conversation history per session ID. Preserves full branching structure (edits, regenerations, navigation between alternatives).

```ts
const store = new IDBConversationStore({
  dbName: "aibind_sw",    // IndexedDB database name
  ttlMs: 1_800_000,       // 30 minutes — idle session expiry
});
```

### Cleanup

Both stores have a `cleanup()` method that deletes expired records. The best place to call it is the SW `activate` event, which fires after each deployment:

```ts
self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    Promise.all([streamStore.cleanup(), conversationStore.cleanup()])
  );
});
```

## CORS requirements

For the SW to call LLM APIs directly, the provider must include CORS headers allowing browser requests. **OpenRouter** supports this by default. Most direct provider APIs (Anthropic, OpenAI) only allow server-to-server requests and will fail with a CORS error from a SW.

Check your provider's CORS policy before using `@aibind/service-worker`.

## Options reference

### `createSWHandler(config)`

Accepts the full `StreamHandlerConfig` from `@aibind/core`:

| Option | Type | Description |
|--------|------|-------------|
| `model` | `LanguageModel` | Single model for all requests |
| `models` | `Record<string, LanguageModel>` | Named models — client selects via `model` key |
| `prefix` | `string` | Route prefix. Default: `"/__aibind__"` |
| `resumable` | `boolean` | Enable resumable streams |
| `store` | `StreamStore` | Store for resumable streams (use `IDBStreamStore`) |
| `conversation` | `ConversationConfig` | Server-side conversation history config |

### `IDBStreamStore`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dbName` | `string` | `"aibind_sw"` | IndexedDB database name |
| `pollIntervalMs` | `number` | `50` | Polling interval for readFrom() (ms) |
| `ttlMs` | `number` | `300_000` | TTL for completed streams before cleanup (ms) |

### `IDBConversationStore`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dbName` | `string` | `"aibind_sw"` | IndexedDB database name |
| `ttlMs` | `number` | `1_800_000` | TTL for idle sessions before cleanup (ms) |
