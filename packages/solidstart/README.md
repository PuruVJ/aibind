# @aibind/solidstart

AI SDK bindings for SolidStart. Reactive SolidJS hooks, server handlers, and agents — all wired up with sensible defaults.

## Features

🤏 **Tiny** — Ships only what you use. Tree-shakes per entry point.
🐇 **Simple** — Three hooks: `useStream`, `useStructuredStream`, `useAgent`. Call and go.
🧙‍♀️ **Elegant** — Returns SolidJS signals. Reactive by nature.
🗃️ **Highly customizable** — Custom endpoints, custom fetch, per-request system overrides, named model registries.
⚛️ **Reactive** — Every piece of state is a SolidJS signal. Fine-grained reactivity out of the box.
🔌 **Batteries included** — Server handler and default endpoints out of the box.

## Install

```bash
npm install @aibind/solidstart ai solid-js
```

Peer dependencies: `solid-js ^1.8`, `ai ^6.0`.

### Schema Libraries

`useStructuredStream` works with any [Standard Schema](https://github.com/standard-schema/standard-schema)-compatible library. Install one:

```bash
# Zod (v4 recommended — has built-in JSON Schema support)
npm install zod

# Valibot (requires JSON Schema converter)
npm install valibot @valibot/to-json-schema

# ArkType (built-in JSON Schema via .toJsonSchema())
npm install arktype
```

## Quick Start

### 1. Add the server handler

```ts
// src/routes/api/__aibind__/[...path].ts
import { createStreamHandler } from '@aibind/solidstart/server';
import { anthropic } from '@ai-sdk/anthropic';

const handler = createStreamHandler({
  model: anthropic('claude-sonnet-4-20250514')
});

export async function POST({ request }: { request: Request }) {
  return handler(request);
}
```

### 2. Stream in a component

```tsx
import { useStream } from '@aibind/solidstart';

function Chat() {
  const { text, loading, send } = useStream({
    system: 'You are a helpful assistant.'
  });

  let prompt = '';

  return (
    <form onSubmit={(e) => { e.preventDefault(); send(prompt); }}>
      <input value={prompt} onInput={(e) => prompt = e.target.value} />
      <button disabled={loading()}>Send</button>
      <Show when={text()}>
        <p>{text()}</p>
      </Show>
    </form>
  );
}
```

## Entry Points

### `@aibind/solidstart` — Client Hooks

```ts
import { useStream, useStructuredStream, defineModels } from '@aibind/solidstart';
```

#### `defineModels(models)`

Define named AI models for type-safe model selection across client and server.

```ts
// src/models.ts
import { defineModels } from '@aibind/solidstart';
import { anthropic } from '@ai-sdk/anthropic';

export const models = defineModels({
  default: anthropic('claude-sonnet-4-20250514'),
  fast: anthropic('claude-haiku-20250514'),
});

export type Models = typeof models.$infer; // 'default' | 'fast'
```

#### `useStream(options?)`

Reactive streaming text. Endpoint defaults to `/api/__aibind__/stream`.

```ts
const { text, loading, error, done, send, abort, retry } = useStream({
  model: 'fast',                           // optional model key
  system: 'You are a poet.',
  endpoint: '/api/custom/stream',          // override default
  fetch: customFetch,                      // optional custom fetch
  onFinish: (text) => console.log(text),
  onError: (err) => console.error(err)
});

send('Write a haiku');
send('Now a limerick', { system: 'Override system prompt' });
text();      // reactive accumulated text (signal accessor)
loading();   // true while streaming
error();     // Error | null
done();      // true when complete
abort();     // cancel in-flight request
retry();     // re-send last prompt
```

#### `useStructuredStream(options)`

Streams JSON and parses partial objects as they arrive. Validates the final result with any Standard Schema-compatible library. Endpoint defaults to `/api/__aibind__/structured`.

```ts
import { useStructuredStream } from '@aibind/solidstart';
import { z } from 'zod';

const { data, partial, raw, loading, error, send } = useStructuredStream({
  schema: z.object({
    sentiment: z.enum(['positive', 'negative', 'neutral']),
    score: z.number(),
    topics: z.array(z.string())
  }),
  system: 'Analyze sentiment. Return JSON matching the schema.'
});

send('I love this product!');
partial(); // Partial<T> — updates as JSON streams in
data();    // T | null — fully validated after completion
raw();     // raw JSON string
```

---

### `@aibind/solidstart/server` — Server Handler

```ts
import { createStreamHandler, ServerAgent } from '@aibind/solidstart/server';
```

#### `createStreamHandler(config)`

Generic Web Request/Response handler for streaming endpoints.

```ts
const handler = createStreamHandler({
  model: anthropic('claude-sonnet-4-20250514'),
  prefix: '/api/__aibind__' // default
});

// Use in a SolidStart catch-all route:
export async function POST({ request }: { request: Request }) {
  return handler(request);
}
```

Handles two routes:
- `POST {prefix}/stream` — text streaming
- `POST {prefix}/structured` — JSON streaming

#### `ServerAgent`

Server-side agent with tools, system prompt, and multi-step tool loops.

```ts
import { ServerAgent } from '@aibind/solidstart/server';
import { tool, stepCountIs } from 'ai';
import { z } from 'zod';

const agent = new ServerAgent({
  model: anthropic('claude-sonnet-4-20250514'),
  system: 'You are a helpful assistant with access to tools.',
  tools: {
    get_weather: tool({
      description: 'Get weather for a city',
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ city, temperature: '72°F', condition: 'sunny' })
    })
  },
  stopWhen: stepCountIs(5)
});
```

---

### `@aibind/solidstart/agent` — Client Agent

```ts
import { useAgent } from '@aibind/solidstart/agent';
```

#### `useAgent(options?)`

Reactive agent hook. Endpoint defaults to `/api/__aibind__/agent`.

```tsx
import { useAgent } from '@aibind/solidstart/agent';

function AgentChat() {
  const { messages, status, send, stop } = useAgent();

  let prompt = '';

  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); send(prompt); prompt = ''; }}>
        <input value={prompt} onInput={(e) => prompt = e.target.value} />
        <button disabled={status() === 'running'}>Send</button>
      </form>

      <For each={messages()}>
        {(message) => <div class={message.role}>{message.content}</div>}
      </For>

      <Show when={status() === 'running'}>
        <button onClick={() => stop()}>Stop</button>
      </Show>
    </>
  );
}
```

**Reactive signals:**
- `messages()` — array of `{ id, role, content, type }` messages
- `status()` — `'idle' | 'running' | 'awaiting-approval' | 'error'`
- `error()` — `Error | null`
- `pendingApproval()` — `{ id, toolName, args } | null`

**Methods:**
- `send(prompt)` — send a message, streams response incrementally
- `stop()` — abort the current request
- `approve(id)` / `deny(id)` — respond to tool approval requests

## Requirements

- SolidJS 1.8+
- AI SDK 6.0+
- Node.js 20+

## License

MIT
