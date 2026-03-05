# Nuxt

## Install

```bash
pnpm add @aibind/nuxt ai @openrouter/ai-sdk-provider
```

## Setup

Follows the same pattern as other frameworks. See [SvelteKit](/frameworks/sveltekit) for the full walkthrough.

### Server Handler

```ts
// server/api/__aibind__/[...path].ts
import { createStreamHandler } from "@aibind/nuxt/server";

const handle = createStreamHandler({ models });

export default defineEventHandler(async (event) => {
  return handle(toWebRequest(event));
});
```

### Client

```vue
<script setup lang="ts">
import { useStream } from "@aibind/nuxt";

const { text, loading, send } = useStream({ model: "fast" });
</script>

<template>
  <button @click="send('Hello!')">Send</button>
  <p>{{ text }}</p>
</template>
```

## Reactivity Model

Uses Vue 3 refs. Reactive properties are accessed with `.value` in script, directly in templates.

## Available Exports

Same export paths as other fullstack packages: `.`, `./server`, `./agent`, `./history`, `./markdown`, `./project`.
