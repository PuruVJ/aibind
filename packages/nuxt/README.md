# @aibind/nuxt

AI SDK bindings for Nuxt. Vue 3 composables, server handlers, and agents — all wired up with sensible defaults.

## Features

🤏 **Tiny** — Ships only what you use. Tree-shakes per entry point.
🐇 **Simple** — Three composables: `useStream`, `useStructuredStream`, `useAgent`. Call in `setup()` and go.
🧙‍♀️ **Elegant** — Returns plain `Ref<T>` values. Use in templates or destructure freely.
🗃️ **Highly customizable** — Custom endpoints, custom fetch, per-request system overrides, named model registries.
⚛️ **Reactive** — Every piece of state is a Vue `ref`. Reactivity works exactly as you'd expect.
🔌 **Batteries included** — Server handler and default endpoints out of the box.

## Install

```bash
npm install @aibind/nuxt ai vue
```

Peer dependencies: `vue ^3.3`, `ai ^6.0`.

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
// server/api/__aibind__/[...path].ts
import { createStreamHandler } from "@aibind/nuxt/server";
import { anthropic } from "@ai-sdk/anthropic";

const handler = createStreamHandler({
  model: anthropic("claude-sonnet-4-20250514"),
});

export default defineEventHandler(async (event) => {
  return handler(toWebRequest(event));
});
```

### 2. Stream in a component

```vue
<script setup lang="ts">
import { useStream } from "@aibind/nuxt";

const { text, loading, send } = useStream({
  system: "You are a helpful assistant.",
});

const prompt = ref("");
</script>

<template>
  <form @submit.prevent="send(prompt)">
    <input v-model="prompt" />
    <button :disabled="loading">Send</button>
  </form>

  <p v-if="text">{{ text }}</p>
</template>
```

## Entry Points

### `@aibind/nuxt` — Client Composables

```ts
import { useStream, useStructuredStream, defineModels } from "@aibind/nuxt";
```

#### `defineModels(models)`

Define named AI models for type-safe model selection.

```ts
// models.ts
import { defineModels } from "@aibind/nuxt";
import { anthropic } from "@ai-sdk/anthropic";

export const models = defineModels({
  default: anthropic("claude-sonnet-4-20250514"),
  fast: anthropic("claude-haiku-20250514"),
});

export type Models = typeof models.$infer; // 'default' | 'fast'
```

#### `useStream(options?)`

Reactive streaming text. Endpoint defaults to `/api/__aibind__/stream`.

```ts
const { text, loading, error, done, send, abort, retry } = useStream({
  model: "fast", // optional model key
  system: "You are a poet.",
  endpoint: "/api/custom/stream", // override default
  fetch: customFetch, // optional custom fetch
  onFinish: (text) => console.log(text),
  onError: (err) => console.error(err),
});

send("Write a haiku");
send("Now a limerick", { system: "Override system prompt" });
text.value; // reactive accumulated text
loading.value; // true while streaming
error.value; // Error | null
done.value; // true when complete
abort(); // cancel in-flight request
retry(); // re-send last prompt
```

#### `useStructuredStream(options)`

Streams JSON and parses partial objects as they arrive. Validates the final result with any Standard Schema-compatible library. Endpoint defaults to `/api/__aibind__/structured`.

```ts
import { useStructuredStream } from "@aibind/nuxt";
import { z } from "zod";

const { data, partial, raw, loading, error, send } = useStructuredStream({
  schema: z.object({
    sentiment: z.enum(["positive", "negative", "neutral"]),
    score: z.number(),
    topics: z.array(z.string()),
  }),
  system: "Analyze sentiment. Return JSON matching the schema.",
});

send("I love this product!");
partial.value; // Partial<T> — updates as JSON streams in
data.value; // T | null — fully validated after completion
raw.value; // raw JSON string
```

---

### `@aibind/nuxt/server` — Server Handler

```ts
import { createStreamHandler, ServerAgent } from "@aibind/nuxt/server";
```

#### `createStreamHandler(config)`

Generic Web Request/Response handler for streaming endpoints.

```ts
const handler = createStreamHandler({
  model: anthropic("claude-sonnet-4-20250514"),
  prefix: "/api/__aibind__", // default
});

// Use in a Nuxt catch-all route:
export default defineEventHandler(async (event) => {
  return handler(toWebRequest(event));
});
```

Handles two routes:

- `POST {prefix}/stream` — text streaming
- `POST {prefix}/structured` — JSON streaming

#### `ServerAgent`

Server-side agent with tools, system prompt, and multi-step tool loops.

```ts
import { ServerAgent } from "@aibind/nuxt/server";
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
```

---

### `@aibind/nuxt/agent` — Client Agent

```ts
import { useAgent } from "@aibind/nuxt/agent";
```

#### `useAgent(options?)`

Reactive agent composable. Endpoint defaults to `/api/__aibind__/agent`.

```vue
<script setup lang="ts">
import { useAgent } from "@aibind/nuxt/agent";

const { messages, status, send, stop } = useAgent();

const prompt = ref("");
</script>

<template>
  <form
    @submit.prevent="
      send(prompt);
      prompt = '';
    "
  >
    <input v-model="prompt" />
    <button :disabled="status === 'running'">Send</button>
  </form>

  <div v-for="message in messages" :key="message.id" :class="message.role">
    {{ message.content }}
  </div>

  <button v-if="status === 'running'" @click="stop()">Stop</button>
</template>
```

**Reactive refs:**

- `messages` — `Ref<AgentMessage[]>`
- `status` — `Ref<'idle' | 'running' | 'awaiting-approval' | 'error'>`
- `error` — `Ref<Error | null>`
- `pendingApproval` — `Ref<{ id, toolName, args } | null>`

**Methods:**

- `send(prompt)` — send a message, streams response incrementally
- `stop()` — abort the current request
- `approve(id)` / `deny(id)` — respond to tool approval requests

---

### `@aibind/nuxt/markdown` — Streaming Markdown

```ts
import { StreamMarkdown } from "@aibind/nuxt/markdown";
```

Renders streaming markdown with recovery for unterminated syntax. Uses `@aibind/markdown` under the hood.

```vue
<script setup lang="ts">
import { useStream } from "@aibind/nuxt";
import { StreamMarkdown } from "@aibind/nuxt/markdown";

const { text, loading } = useStream({ system: "You are a helpful assistant." });
</script>

<template>
  <StreamMarkdown :text="text" :streaming="loading" />
</template>
```

**Props:**

- `text` — markdown string to render
- `streaming` — when `true`, applies markdown recovery (closes unterminated bold, code blocks, etc.)

### `@aibind/nuxt/history` — Branching Conversation History

```ts
import {
  ReactiveChatHistory,
  ReactiveMessageTree,
  ChatHistory,
  MessageTree,
} from "@aibind/nuxt/history";
```

Tree-structured conversation history with branching support. Edit messages, regenerate responses, and navigate alternatives (ChatGPT-style).

```vue
<script setup lang="ts">
import { ReactiveChatHistory } from "@aibind/nuxt/history";

const chat = new ReactiveChatHistory<{ role: string; content: string }>();
chat.append({ role: "user", content: "Hello" });
chat.append({ role: "assistant", content: "Hi!" });
</script>

<template>
  <div v-for="(msg, i) in chat.messages.value" :key="chat.nodeIds.value[i]">
    {{ msg.role }}: {{ msg.content }}
  </div>
</template>
```

See [`@aibind/core` README](https://www.npmjs.com/package/@aibind/core) for full API documentation.

## Requirements

- Vue 3.3+
- AI SDK 6.0+
- Node.js 20+

## License

MIT
