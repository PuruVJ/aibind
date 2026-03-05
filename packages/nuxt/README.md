# @aibind/nuxt

AI SDK bindings for Nuxt. Vue 3 composables, server handlers, and agents — all wired up with sensible defaults.

## Install

```bash
npm install @aibind/nuxt ai vue
```

Peer dependencies: `vue ^3.3`, `ai ^6.0`.

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

| Import Path             | What You Get                                       |
| ----------------------- | -------------------------------------------------- |
| `@aibind/nuxt`          | `useStream`, `useStructuredStream`, `defineModels` |
| `@aibind/nuxt/server`   | `createStreamHandler`, `ServerAgent`               |
| `@aibind/nuxt/agent`    | `useAgent`                                         |
| `@aibind/nuxt/history`  | `ReactiveChatHistory`, `ReactiveMessageTree`       |
| `@aibind/nuxt/markdown` | `StreamMarkdown`                                   |
| `@aibind/nuxt/project`  | `Project`                                          |

## Documentation

Full documentation, API reference, and guides: **[aibind.dev](https://aibind.dev)**

- [Nuxt Setup Guide](https://aibind.dev/frameworks/nuxt)
- [Streaming](https://aibind.dev/concepts/streaming)
- [Structured Output](https://aibind.dev/concepts/structured-output)
- [Chat History & Branching](https://aibind.dev/concepts/chat-history)
- [Agents](https://aibind.dev/concepts/agents)

## License

MIT
