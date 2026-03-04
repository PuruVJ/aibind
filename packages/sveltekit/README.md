# @aibind/sveltekit

AI SDK bindings for SvelteKit. Reactive Svelte 5 classes, server handlers, remote functions, and agents — all wired up with sensible defaults.

## Features

🤏 **Tiny** — Ships only what you use. Tree-shakes per entry point.
🐇 **Simple** — Three classes: `Stream`, `StructuredStream`, `Agent`. Instantiate and `.send()`.
🧙‍♀️ **Elegant** — Svelte 5 runes (`$state`) on every field. No stores, no boilerplate.
🗃️ **Highly customizable** — Custom endpoints, custom fetch, per-request system overrides, named model registries.
⚛️ **Reactive** — Text, loading, error, done — all reactive. Just bind and go.
🔌 **Batteries included** — Server handler, remote functions, and default endpoints out of the box.

## Install

```bash
npm install @aibind/sveltekit ai svelte
```

Peer dependencies: `svelte ^5.53`, `ai ^6.0`, `@sveltejs/kit ^2.53`.

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
import { createStreamHandler } from "@aibind/sveltekit/server";
import { anthropic } from "@ai-sdk/anthropic";

export const handle = createStreamHandler({
  model: anthropic("claude-sonnet-4-20250514"),
});
```

This handles `/__aibind__/stream` and `/__aibind__/structured` automatically.

### 2. Stream in a component

```svelte
<script lang="ts">
  import { Stream } from '@aibind/sveltekit';

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

### `@aibind/sveltekit` — Client Classes

```ts
import { Stream, StructuredStream, defineModels } from "@aibind/sveltekit";
```

#### `defineModels(models)`

Define named AI models for type-safe model selection across client and server.

```ts
// src/lib/models.server.ts
import { defineModels } from "@aibind/sveltekit";
import { anthropic } from "@ai-sdk/anthropic";

export const models = defineModels({
  default: anthropic("claude-sonnet-4-20250514"),
  fast: anthropic("claude-haiku-20250514"),
});

export type Models = typeof models.$infer; // 'default' | 'fast'
```

Pass models to the server handler:

```ts
// src/hooks.server.ts
import { createStreamHandler } from "@aibind/sveltekit/server";
import { models } from "$lib/models.server";

export const handle = createStreamHandler({ models });
```

#### `new Stream(options?)`

Reactive streaming text. All properties are Svelte 5 `$state` fields. Endpoint defaults to `/__aibind__/stream`.

```ts
const stream = new Stream({
  model: "fast", // optional model key
  system: "You are a poet.",
  endpoint: "/api/custom/stream", // override default
  fetch: customFetch, // optional custom fetch
  onFinish: (text) => console.log(text),
  onError: (err) => console.error(err),
});

stream.send("Write a haiku");
stream.send("Now a limerick", { system: "Override system prompt" });
stream.text; // reactive accumulated text
stream.loading; // true while streaming
stream.error; // Error | null
stream.done; // true when complete
stream.status; // 'idle' | 'streaming' | 'stopped' | 'done' | 'reconnecting' | 'disconnected' | 'error'
stream.streamId; // string | null — set when server uses SSE (resumable)
stream.canResume; // true if stream was interrupted but can be resumed
stream.abort(); // cancel in-flight request
stream.retry(); // re-send last prompt
stream.stop(); // signal server to stop LLM generation, keep partial text
stream.resume(); // reconnect to interrupted stream
```

When paired with a resumable server handler (`resumable: true`), `Stream` auto-detects SSE responses and enables stop/resume. On network drop, it auto-reconnects up to 3 times with exponential backoff.

```svelte
<script lang="ts">
  import { Stream } from '@aibind/sveltekit';
  const stream = new Stream();
</script>

{#if stream.status === 'streaming'}
  <button onclick={() => stream.stop()}>Stop</button>
{/if}

{#if stream.canResume}
  <button onclick={() => stream.resume()}>Resume</button>
{/if}
```

#### `new StructuredStream(options)`

Streams JSON and parses partial objects as they arrive. Validates the final result with any [Standard Schema](https://github.com/standard-schema/standard-schema)-compatible library. Extends `Stream` — inherits all abort+resume capabilities. Endpoint defaults to `/__aibind__/structured`.

```ts
import { StructuredStream } from "@aibind/sveltekit";
import { z } from "zod";

const analysis = new StructuredStream({
  schema: z.object({
    sentiment: z.enum(["positive", "negative", "neutral"]),
    score: z.number(),
    topics: z.array(z.string()),
  }),
  system: "Analyze sentiment. Return JSON matching the schema.",
});

analysis.send("I love this product!");
analysis.partial; // Partial<T> — updates as JSON streams in
analysis.data; // T | null — fully validated after completion
analysis.raw; // raw JSON string
```

---

### `@aibind/sveltekit/server` — Stream Handler

```ts
import { createStreamHandler, ServerAgent } from "@aibind/sveltekit/server";
```

#### `createStreamHandler(config)`

SvelteKit handle hook that serves streaming endpoints.

```ts
// Single model
export const handle = createStreamHandler({
  model: anthropic("claude-sonnet-4-20250514"),
  prefix: "/__aibind__", // default
});

// Multi-model
export const handle = createStreamHandler({ models });

// Resumable streams (abort + resume)
export const handle = createStreamHandler({
  models,
  resumable: true, // enables stop/resume/reconnect
  store: new MemoryStreamStore(), // optional, defaults to MemoryStreamStore
});
```

**Routes:**

| Route                    | Method | Description                           |
| ------------------------ | ------ | ------------------------------------- |
| `{prefix}/stream`        | POST   | Text streaming                        |
| `{prefix}/structured`    | POST   | JSON streaming                        |
| `{prefix}/stream/stop`   | POST   | Stop generation (resumable only)      |
| `{prefix}/stream/resume` | GET    | Resume from sequence (resumable only) |

#### `ServerAgent`

Server-side agent with tools, system prompt, and multi-step tool loops.

```ts
import { ServerAgent } from "@aibind/sveltekit/server";
import { tool, stepCountIs } from "ai";
import { z } from "zod";

const agent = new ServerAgent({
  model: anthropic("claude-sonnet-4-20250514"),
  system: "You are a helpful assistant with access to tools.",
  tools: {
    get_weather: tool({
      description: "Get weather for a city",
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => ({
        city,
        temperature: "72°F",
        condition: "sunny",
      }),
    }),
  },
  stopWhen: stepCountIs(5),
});

// In a SvelteKit endpoint:
export async function POST({ request }) {
  const { messages } = await request.json();
  const lastMessage = messages[messages.length - 1];
  const result = agent.stream(lastMessage.content, {
    messages: messages.slice(0, -1),
  });
  return result.toTextStreamResponse();
}
```

---

### `@aibind/sveltekit/remote` — SvelteKit Remote Functions

```ts
import { AIRemote } from "@aibind/sveltekit/remote";
```

> Requires `@sveltejs/kit ^2.53`.

#### `new AIRemote(model)`

Wraps SvelteKit's [remote functions](https://svelte.dev/docs/kit/remote-functions) with AI SDK.

```ts
// src/lib/ai.server.ts
import { AIRemote } from "@aibind/sveltekit/remote";

export const ai = new AIRemote(anthropic("claude-sonnet-4-20250514"));
```

##### `ai.query(schema, promptFn)` — Text response

```ts
// src/routes/api/summarize.remote.ts
import { ai } from "$lib/ai.server";
import { z } from "zod";

export const summarize = ai.query(
  z.string(),
  (text) => `Summarize this: ${text}`,
);
```

##### `ai.structuredQuery({ input, output, prompt })` — Typed response

```ts
export const analyze = ai.structuredQuery({
  input: z.string(),
  output: z.object({
    sentiment: z.enum(["positive", "negative", "neutral"]),
    confidence: z.number(),
  }),
  prompt: (text) => `Analyze: ${text}`,
  system: "Return JSON matching the output schema.",
});
```

##### `ai.command(schema, handler)` — Mutations

```ts
export const generatePost = ai.command(
  z.object({ topic: z.string() }),
  async (input, { model }) => {
    const result = await generateText({
      model,
      prompt: `Write about ${input.topic}`,
    });
    await db.posts.create({ content: result.text });
    return { id: post.id };
  },
);
```

---

### `@aibind/sveltekit/agent` — Client Agent

```ts
import { Agent } from "@aibind/sveltekit/agent";
```

#### `new Agent(options?)`

Reactive agent state. Endpoint defaults to `/__aibind__/agent`.

```svelte
<script lang="ts">
  import { Agent } from '@aibind/sveltekit/agent';

  const agent = new Agent();

  let prompt = $state('');
</script>

<form onsubmit={(e) => { e.preventDefault(); agent.send(prompt); prompt = ''; }}>
  <input bind:value={prompt} />
  <button disabled={agent.status === 'running'}>Send</button>
</form>

{#each agent.messages as message (message.id)}
  <div class={message.role}>{message.content}</div>
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

---

### `@aibind/sveltekit/markdown` — Streaming Markdown

```ts
import { StreamMarkdown } from "@aibind/sveltekit/markdown";
```

Renders streaming markdown with recovery for unterminated syntax. Uses `@aibind/markdown` under the hood.

```svelte
<script lang="ts">
  import { Stream } from '@aibind/sveltekit';
  import { StreamMarkdown } from '@aibind/sveltekit/markdown';

  const stream = new Stream({ system: 'You are a helpful assistant.' });
</script>

<StreamMarkdown text={stream.text} streaming={stream.loading} />
```

**Props:**

- `text` — markdown string to render
- `streaming` — when `true`, applies markdown recovery (closes unterminated bold, code blocks, etc.)
- `class` — optional CSS class

### `@aibind/sveltekit/history` — Branching Conversation History

```ts
import {
  ReactiveChatHistory,
  ReactiveMessageTree,
  ChatHistory,
  MessageTree,
} from "@aibind/sveltekit/history";
```

Tree-structured conversation history with branching support. Edit messages, regenerate responses, and navigate alternatives (ChatGPT-style).

```svelte
<script lang="ts">
  import { ReactiveChatHistory } from '@aibind/sveltekit/history';

  const chat = new ReactiveChatHistory<{ role: string; content: string }>();
  chat.append({ role: 'user', content: 'Hello' });
  chat.append({ role: 'assistant', content: 'Hi!' });
</script>

{#each chat.messages as msg, i}
  <div>{msg.role}: {msg.content}</div>
  {#if chat.hasAlternatives(chat.nodeIds[i])}
    <button onclick={() => chat.prevAlternative(chat.nodeIds[i])}>←</button>
    {chat.alternativeIndex(chat.nodeIds[i]) + 1}/{chat.alternativeCount(chat.nodeIds[i])}
    <button onclick={() => chat.nextAlternative(chat.nodeIds[i])}>→</button>
  {/if}
{/each}
```

See [`@aibind/core` README](https://www.npmjs.com/package/@aibind/core) for full API documentation.

## Requirements

- Svelte 5.53+
- SvelteKit 2.53+
- AI SDK 6.0+
- Node.js 20+

## License

MIT
