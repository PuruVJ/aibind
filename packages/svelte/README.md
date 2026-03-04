# @aibind/svelte

AI SDK bindings for SvelteKit. Reactive Svelte 5 classes for streaming, structured output, agents, and server-side AI helpers built on [Vercel AI SDK](https://sdk.vercel.ai/).

## Install

```bash
npm install @aibind/svelte ai svelte
```

Peer dependencies: `svelte ^5.53`, `ai ^6.0`, `@sveltejs/kit ^2.53` (optional for remote functions).

### Schema Libraries

`StructuredStream` works with any [Standard Schema](https://github.com/standard-schema/standard-schema)-compatible library. Install one:

```bash
# Zod (v4 recommended — has built-in JSON Schema support)
npm install zod

# Valibot (requires JSON Schema converter)
npm install valibot @valibot/to-json-schema

# ArkType (built-in JSON Schema via .toJsonSchema())
npm install arktype
```

## Quick Start

### 1. Add the stream handler

```ts
// src/hooks.server.ts
import { createStreamHandler } from '@aibind/svelte/server';
import { anthropic } from '@ai-sdk/anthropic';

export const handle = createStreamHandler({
  model: anthropic('claude-sonnet-4-20250514')
});
```

This handles `/api/svai/stream` and `/api/svai/structured` requests.

### 2. Stream in a component

```svelte
<script lang="ts">
  import { Stream } from '@aibind/svelte';

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

### `@aibind/svelte` — Client Classes

```ts
import { Stream, StructuredStream, defineModels } from '@aibind/svelte';
```

#### `defineModels(models)`

Define named AI models for type-safe model selection across client and server.

```ts
// src/lib/models.server.ts
import { defineModels } from '@aibind/svelte';
import { anthropic } from '@ai-sdk/anthropic';

export const models = defineModels({
  default: anthropic('claude-sonnet-4-20250514'),
  fast: anthropic('claude-haiku-20250514'),
});

export type Models = typeof models.$infer; // 'default' | 'fast'
```

Pass models to the server handler:

```ts
// src/hooks.server.ts
import { createStreamHandler } from '@aibind/svelte/server';
import { models } from '$lib/models.server';

export const handle = createStreamHandler({ models });
```

#### `new Stream(options?)`

Reactive streaming text. All properties are Svelte 5 `$state` fields.

```ts
const stream = new Stream({
  model: 'fast',                           // optional model key
  system: 'You are a poet.',
  endpoint: '/api/custom/stream',          // default: '/api/svai/stream'
  fetch: customFetch,                      // optional custom fetch
  onFinish: (text) => console.log(text),
  onError: (err) => console.error(err)
});

stream.send('Write a haiku');
stream.send('Now a limerick', { system: 'Override system prompt' });
stream.text;    // reactive accumulated text
stream.loading; // true while streaming
stream.error;   // Error | null
stream.done;    // true when complete
stream.abort(); // cancel in-flight request
stream.retry(); // re-send last prompt
```

#### `new StructuredStream(options)`

Streams JSON and parses partial objects as they arrive. Validates the final result with any [Standard Schema](https://github.com/standard-schema/standard-schema)-compatible library (Zod, Valibot, ArkType, etc.).

```ts
import { StructuredStream } from '@aibind/svelte';
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

---

### `@aibind/svelte/server` — Server Helpers

```ts
import { createStreamHandler, AIServer } from '@aibind/svelte/server';
```

#### `createStreamHandler(config)`

SvelteKit handle hook that serves streaming endpoints.

```ts
// Single model
export const handle = createStreamHandler({
  model: anthropic('claude-sonnet-4-20250514'),
  prefix: '/api/svai' // default
});

// Multi-model
export const handle = createStreamHandler({ models });
```

Handles two routes:
- `POST {prefix}/stream` — text streaming
- `POST {prefix}/structured` — JSON streaming

#### `new AIServer(model)`

Wraps SvelteKit's [remote functions](https://svelte.dev/docs/kit/remote-functions) with AI SDK.

```ts
// src/lib/ai.server.ts
import { AIServer } from '@aibind/svelte/server';

export const ai = new AIServer(anthropic('claude-sonnet-4-20250514'));
```

##### `ai.query(schema, promptFn)` — Text response

```ts
// src/routes/api/summarize.remote.ts
import { ai } from '$lib/ai.server';
import { z } from 'zod';

export const summarize = ai.query(
  z.string(),
  (text) => `Summarize this: ${text}`
);
```

##### `ai.structuredQuery({ input, output, prompt })` — Typed response

```ts
export const analyze = ai.structuredQuery({
  input: z.string(),
  output: z.object({
    sentiment: z.enum(['positive', 'negative', 'neutral']),
    confidence: z.number()
  }),
  prompt: (text) => `Analyze: ${text}`,
  system: 'Return JSON matching the output schema.'
});
```

##### `ai.command(schema, handler)` — Mutations

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

### `@aibind/svelte/agent` — Agents

Server-side agent with tools and client-side reactive state.

#### `new ServerAgent(config)` — Server

Define an agent with a system prompt, tools, and a stop condition. Uses AI SDK's `generateText`/`streamText` with multi-step tool loops.

```ts
// src/routes/api/agent/+server.ts
import { ServerAgent } from '@aibind/svelte/agent';
import { tool, stepCountIs } from 'ai';
import { z } from 'zod';

const agent = new ServerAgent({
  model: anthropic('claude-sonnet-4-20250514'),
  system: 'You are a helpful assistant with access to tools.',
  tools: {
    get_weather: tool({
      description: 'Get weather for a city',
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => ({
        city,
        temperature: '72°F',
        condition: 'sunny'
      })
    }),
    get_time: tool({
      description: 'Get the current time',
      inputSchema: z.object({}),
      execute: async () => ({ time: new Date().toLocaleTimeString() })
    })
  },
  stopWhen: stepCountIs(5) // stop after 5 tool-use steps
});
```

##### `agent.stream(prompt, options?)` — Streaming response

Returns a `StreamTextResult` synchronously (no await needed). Use in SvelteKit endpoints:

```ts
export async function POST({ request }) {
  const { messages } = await request.json();
  const lastMessage = messages[messages.length - 1];

  const result = agent.stream(lastMessage.content, {
    messages: messages.slice(0, -1) // pass conversation history
  });

  return result.toTextStreamResponse();
}
```

##### `agent.run(prompt, options?)` — Non-streaming response

```ts
const result = await agent.run('What is the weather in SF?');
console.log(result.text);
```

#### `new Agent(options?)` — Client

Reactive agent state for the client. Messages stream in incrementally — the UI updates as chunks arrive.

```svelte
<script lang="ts">
  import { Agent } from '@aibind/svelte/agent';

  const agent = new Agent({
    endpoint: '/api/svai/agent',  // default
    fetch: customFetch,            // optional
    onMessage: (msg) => console.log(msg),
    onError: (err) => console.error(err)
  });

  let prompt = $state('');
</script>

<form onsubmit={(e) => { e.preventDefault(); agent.send(prompt); prompt = ''; }}>
  <input bind:value={prompt} />
  <button disabled={agent.status === 'running'}>Send</button>
</form>

{#each agent.messages as message (message.id)}
  <div class={message.role}>
    {message.content}
  </div>
{/each}

{#if agent.status === 'running'}
  <button onclick={() => agent.stop()}>Stop</button>
{/if}
```

**Reactive properties:**
- `messages` — array of `{ id, role, content, type }` messages
- `status` — `'idle' | 'running' | 'awaiting-approval' | 'error'`
- `error` — `Error | null`
- `pendingApproval` — `{ id, toolName, args } | null`

**Methods:**
- `send(prompt)` — send a message, streams response incrementally
- `stop()` — abort the current request
- `approve(id)` / `deny(id)` — respond to tool approval requests

## Requirements

- Svelte 5.53+
- AI SDK 6.0+
- SvelteKit 2.53+ (for remote functions)
- Node.js 20+

## License

MIT
