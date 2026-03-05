# SvelteKit

SvelteKit is the primary framework for aibind and has the most complete integration.

## Install

```bash
pnpm add @aibind/sveltekit ai @openrouter/ai-sdk-provider
```

## Setup

### 1. Define Models

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

export type Models = typeof models.$infer;
```

### 2. Server Handler

```ts
// src/hooks.server.ts
import { createStreamHandler } from "@aibind/sveltekit/server";
import { models } from "./models.server";

export const handle = createStreamHandler({
  models,
  resumable: true, // Enable durable streams
});
```

### 3. Streaming

```svelte
<script lang="ts">
  import { Stream } from '@aibind/sveltekit';

  const stream = new Stream({
    model: 'fast',
    system: 'You are helpful.',
  });

  let prompt = $state('');
</script>

<form onsubmit={(e) => { e.preventDefault(); stream.send(prompt); prompt = ''; }}>
  <input bind:value={prompt} />
  <button disabled={stream.loading}>Send</button>
</form>

<p>{stream.text}</p>
```

### 4. Structured Output

```svelte
<script lang="ts">
  import { StructuredStream } from '@aibind/sveltekit';
  import { z } from 'zod/v4';

  const schema = z.object({
    sentiment: z.enum(['positive', 'negative', 'neutral']),
    score: z.number(),
  });

  const analysis = new StructuredStream({ schema });
</script>

<button onclick={() => analysis.send('Analyze: Great product!')}>Analyze</button>

{#if analysis.partial}
  <p>Sentiment: {analysis.partial.sentiment}</p>
  <p>Score: {analysis.partial.score}</p>
{/if}
```

## Reactivity Model

SvelteKit uses Svelte 5 runes (`$state`, `$derived`). All aibind classes expose reactive properties directly:

```svelte
<!-- Direct property access — no .value or () needed -->
<p>{stream.text}</p>
<p>{stream.loading}</p>
<p>{chat.messages.length}</p>
```

## Available Exports

| Import Path                  | What You Get                                 |
| ---------------------------- | -------------------------------------------- |
| `@aibind/sveltekit`          | `Stream`, `StructuredStream`, `defineModels` |
| `@aibind/sveltekit/server`   | `createStreamHandler`, `ServerAgent`         |
| `@aibind/sveltekit/agent`    | `useAgent`                                   |
| `@aibind/sveltekit/history`  | `ChatHistory`, `MessageTree`                 |
| `@aibind/sveltekit/markdown` | `StreamMarkdown`                             |
| `@aibind/sveltekit/project`  | `Project`                                    |
