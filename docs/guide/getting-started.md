# Getting Started

aibind provides universal AI SDK bindings for every major JavaScript framework. It wraps the [Vercel AI SDK](https://sdk.vercel.ai/) with reactive primitives native to your framework.

## What You Get

- **Streaming text** — Real-time text streaming with abort, retry, and resume
- **Structured output** — Stream typed JSON with partial updates using any Standard Schema
- **Agents** — Server-side tool-calling with streaming responses
- **Chat history** — Branching conversation trees with edit/regenerate/navigate
- **Projects** — Claude-like project context management
- **Markdown** — Streaming markdown rendering with recovery for incomplete syntax

## Quick Example (SvelteKit)

### 1. Install

```bash
pnpm add @aibind/sveltekit ai @openrouter/ai-sdk-provider
```

### 2. Configure models (server)

```ts
// src/models.server.ts
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { defineModels } from "@aibind/sveltekit";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export const models = defineModels({
  fast: openrouter("google/gemini-3.1-flash-lite-preview"),
  smart: openrouter("openai/gpt-5-mini"),
});
```

### 3. Create the server handler

```ts
// src/hooks.server.ts
import { createStreamHandler } from "@aibind/sveltekit/server";
import { models } from "./models.server";

export const handle = createStreamHandler({ models });
```

### 4. Use in your component

```svelte
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";

  const stream = new Stream({ model: "fast" });
  let prompt = $state("");
</script>

<form
  onsubmit={(e) => {
    e.preventDefault();
    stream.send(prompt);
    prompt = "";
  }}
>
  <input bind:value={prompt} placeholder="Ask something..." />
  <button disabled={stream.loading}>Send</button>
</form>

{#if stream.text}
  <div>{stream.text}</div>
{/if}
```

## Next Steps

- [Installation](/guide/installation) — All framework install commands
- [Streaming](/concepts/streaming) — Deep dive into text streaming
- [Structured Output](/concepts/structured-output) — Typed JSON streaming
- [Agents](/concepts/agents) — Tool-calling agents
