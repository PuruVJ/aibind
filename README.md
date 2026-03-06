<p align="center">
  <img src="https://aibind.dev/logo.png" width="96" height="96" alt="aibind" />
</p>

# aibind

Universal AI SDK bindings for every major JavaScript framework. Reactive streaming, structured output, agents, branching chat history, markdown rendering — built on the [Vercel AI SDK](https://sdk.vercel.ai/).

## Packages

### Fullstack frameworks

| Package | Framework |
|---------|-----------|
| [`@aibind/sveltekit`](packages/sveltekit) | SvelteKit |
| [`@aibind/nextjs`](packages/nextjs) | Next.js |
| [`@aibind/nuxt`](packages/nuxt) | Nuxt |
| [`@aibind/solidstart`](packages/solidstart) | SolidStart |
| [`@aibind/tanstack-start`](packages/tanstack-start) | TanStack Start |
| [`@aibind/react-router`](packages/react-router) | React Router v7 |

### Client-only

| Package | Framework |
|---------|-----------|
| [`@aibind/svelte`](packages/svelte) | Svelte 5 |
| [`@aibind/react`](packages/react) | React |
| [`@aibind/vue`](packages/vue) | Vue 3 |
| [`@aibind/solid`](packages/solid) | SolidJS |

### Storage integrations

| Package | Backend |
|---------|---------|
| [`@aibind/redis`](packages/redis) | Redis (ioredis, Upstash, node-redis) |
| [`@aibind/sqlite`](packages/sqlite) | SQLite / Turso (libsql, better-sqlite3) |
| [`@aibind/postgres`](packages/postgres) | PostgreSQL (pg, Neon, Supabase, postgres.js) |
| [`@aibind/cloudflare`](packages/cloudflare) | Cloudflare Workers (D1 + KV) |
| [`@aibind/service-worker`](packages/service-worker) | Service Worker (zero-server, IndexedDB) |

### Core

| Package | Description |
|---------|-------------|
| [`@aibind/core`](packages/core) | Framework-agnostic controllers and types |
| [`@aibind/markdown`](packages/markdown) | Streaming markdown parser |

## Quick Start

```bash
pnpm add @aibind/sveltekit ai @openrouter/ai-sdk-provider
```

```ts
// src/hooks.server.ts
import { createStreamHandler } from "@aibind/sveltekit/server";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { defineModels } from "@aibind/sveltekit";

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });

export const handle = createStreamHandler({
  models: defineModels({
    fast: openrouter("google/gemini-3.1-flash-lite-preview"),
    smart: openrouter("openai/gpt-5-mini"),
  }),
});
```

```svelte
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";
  const stream = new Stream({ model: "fast" });
  let prompt = $state("");
</script>

<input bind:value={prompt} />
<button onclick={() => stream.send(prompt)} disabled={stream.loading}>Send</button>
<p>{stream.text}</p>
```

## Development

```bash
pnpm install
pnpm test
pnpm dev        # start demo playground
```

## License

MIT
