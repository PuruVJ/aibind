# svai

AI SDK bindings for SvelteKit. Reactive Svelte 5 classes for streaming, structured output, and server-side AI helpers built on [Vercel AI SDK](https://sdk.vercel.ai/).

## Install

```bash
npm install svai ai @ai-sdk/anthropic svelte
```

Peer dependencies: `svelte ^5.53`, `ai ^6.0`, `@sveltejs/kit ^2.53` (optional), `zod ^3.23` (optional — or any [Standard Schema](https://github.com/standard-schema/standard-schema) library).

## Quick Start

### 1. Add the stream handler

```ts
// src/hooks.server.ts
import { createStreamHandler } from 'svai/server';
import { anthropic } from '@ai-sdk/anthropic';

export const handle = createStreamHandler({
  model: anthropic('claude-sonnet-4-20250514')
});
```

This handles `/api/svai/stream` and `/api/svai/structured` requests.

### 2. Stream in a component

```svelte
<script lang="ts">
  import { Stream } from 'svai';

  const stream = new Stream({
    system: 'You are a helpful assistant.'
  });

  let prompt = $state('');
</script>

<form onsubmit={(e) => { e.preventDefault(); stream.send(prompt); }}>
  <input bind:value={prompt} />
  <button disabled={stream.loading}>Send</button>
</form>

{#if stream.text}
  <p>{stream.text}</p>
{/if}
```

## Entry Points

### `svai` — Client Classes

```ts
import { Stream, StructuredStream, defineModels } from 'svai';
```

#### `defineModels(models)`

Define named AI models for type-safe model selection across client and server. Returns the same object with a phantom `$infer` type for extracting model keys.

```ts
// src/lib/models.ts — importable on both client and server
import { defineModels } from 'svai';
import { anthropic } from '@ai-sdk/anthropic';

export const models = defineModels({
  default: anthropic('claude-sonnet-4-20250514'),
  fast: anthropic('claude-haiku-20250514'),
});

export type Models = typeof models.$infer; // 'default' | 'fast'
```

Then use the type on the client for autocomplete:

```svelte
<script lang="ts">
  import { Stream } from 'svai';
  import type { Models } from '$lib/models';

  const stream = new Stream<Models>({ model: 'fast' });
</script>
```

And pass the models to the server handler:

```ts
// src/hooks.server.ts
import { createStreamHandler } from 'svai/server';
import { models } from '$lib/models';

export const handle = createStreamHandler({ models });
```

#### `new Stream(options?)`

Reactive streaming text. All properties are Svelte 5 `$state` fields.

```ts
const stream = new Stream({
  model: 'fast',                           // optional model key
  system: 'You are a poet.',
  endpoint: '/api/custom/stream',          // default: '/api/svai/stream'
  onFinish: (text) => console.log(text),
  onError: (err) => console.error(err)
});

stream.send('Write a haiku');
stream.send('Now a limerick', { system: 'You are a comedian.' }); // per-request system override
stream.text;    // reactive accumulated text
stream.loading; // true while streaming
stream.error;   // Error | null
stream.done;    // true when complete
stream.abort(); // cancel in-flight request
stream.retry(); // re-send last prompt with same options
```

Calling `send()` while a request is in-flight automatically aborts the previous one. The stream is cleaned up automatically when the component is destroyed.

#### `new StructuredStream(options)`

Streams JSON and parses partial objects as they arrive. Validates the final result with any [Standard Schema](https://github.com/standard-schema/standard-schema)-compatible library (Zod, Valibot, ArkType, etc.).

```ts
import { StructuredStream } from 'svai';
import { z } from 'zod';

const analysis = new StructuredStream({
  schema: z.object({
    sentiment: z.enum(['positive', 'negative', 'neutral']),
    score: z.number(),
    topics: z.array(z.string())
  }),
  system: 'Analyze sentiment. Return JSON matching the schema.'
});

analysis.send('I love this product!');
analysis.partial; // Partial<T> — updates as JSON streams in
analysis.data;    // T | null — fully validated after completion
analysis.raw;     // raw JSON string
```

Works with any Standard Schema library:

```ts
// Valibot
import * as v from 'valibot';

const stream = new StructuredStream({
  schema: v.object({
    sentiment: v.picklist(['positive', 'negative', 'neutral']),
    score: v.number()
  }),
  system: 'Analyze sentiment.'
});
```

---

### `svai/server` — Server Helpers

Stream handler and SvelteKit remote function wrappers.

```ts
import { createStreamHandler, AIServer } from 'svai/server';
```

#### `createStreamHandler(config)`

SvelteKit handle hook that serves streaming endpoints. Use in `hooks.server.ts`.

```ts
// Single model
import { createStreamHandler } from 'svai/server';
import { anthropic } from '@ai-sdk/anthropic';

export const handle = createStreamHandler({
  model: anthropic('claude-sonnet-4-20250514'),
  prefix: '/api/svai' // default
});

// Multi-model (with defineModels)
import { models } from '$lib/models';

export const handle = createStreamHandler({ models });
```

Handles two routes:
- `POST {prefix}/stream` — text streaming
- `POST {prefix}/structured` — JSON streaming

The client sends `{ prompt, system?, model? }` in the request body. When using `models`, the `model` key selects which model to use (defaults to the first key).

#### `new AIServer(model)`

Wraps SvelteKit's [remote functions](https://svelte.dev/docs/kit/remote-functions) with AI SDK. No global state — each instance holds its own model.

```ts
// src/lib/ai.server.ts
import { AIServer } from 'svai/server';
import { anthropic } from '@ai-sdk/anthropic';

export const ai = new AIServer(anthropic('claude-sonnet-4-20250514'));
```

#### `ai.query(schema, promptFn)` — Text response

```ts
// src/routes/api/summarize.remote.ts
import { ai } from '$lib/ai.server';
import { z } from 'zod';

export const summarize = ai.query(
  z.object({ text: z.string() }),
  (input) => `Summarize this: ${input.text}`
);
```

#### `ai.structuredQuery({ input, output, prompt })` — Typed response

```ts
export const analyze = ai.structuredQuery({
  input: z.object({ text: z.string() }),
  output: z.object({
    sentiment: z.enum(['positive', 'negative', 'neutral']),
    confidence: z.number()
  }),
  prompt: (input) => `Analyze: ${input.text}`,
  system: 'Return JSON matching the output schema.'
});
```

#### `ai.command(schema, handler)` — Mutations

```ts
export const generatePost = ai.command(
  z.object({ topic: z.string() }),
  async (input, { model }) => {
    const result = await generateText({ model, prompt: `Write about ${input.topic}` });
    await db.posts.create({ content: result.text });
    return { id: post.id };
  }
);
```

---

### `svai/agent` — Agents

Server-side agent definition and client-side reactive state.

```ts
import { ServerAgent, Agent } from 'svai/agent';
```

#### `new ServerAgent(config)` — Server

```ts
import { ServerAgent } from 'svai/agent';
import { tool } from 'ai';
import { z } from 'zod';

const agent = new ServerAgent({
  model: anthropic('claude-sonnet-4-20250514'),
  system: 'You are a helpful assistant with access to tools.',
  tools: {
    getWeather: tool({
      description: 'Get weather for a city',
      parameters: z.object({ city: z.string() }),
      execute: async ({ city }) => `72F in ${city}`
    })
  },
  maxSteps: 10
});

const result = await agent.run('What is the weather in SF?');
```

#### `new Agent(options?)` — Client

Reactive agent state for the client. All properties are `$state` fields.

```ts
const agent = new Agent({
  endpoint: '/api/agent',
  onMessage: (msg) => console.log(msg),
  onError: (err) => console.error(err)
});

agent.send('Plan a trip to Tokyo');
agent.messages; // reactive message list
agent.status;   // 'idle' | 'running' | 'awaiting-approval' | 'error'
agent.stop();   // abort the current request
```

## Requirements

- Svelte 5.53+
- AI SDK 6.0+
- SvelteKit 2.53+ (for `svai/server` remote functions)
- Node.js 20+

## License

MIT
