# Structured Output

Stream typed JSON with real-time partial updates. The AI generates JSON matching your schema, and you get type-safe access to fields as they arrive.

## How It Works

1. Define a schema with Zod, Valibot, or any [Standard Schema](https://github.com/standard-schema/standard-schema) library
2. aibind resolves the JSON schema and sends it to the server
3. The AI streams JSON tokens
4. aibind parses partial JSON and provides both `partial` (in-progress) and `data` (validated final result)

## Client API

### SvelteKit

```svelte
<script lang="ts">
  import { StructuredStream } from '@aibind/sveltekit';
  import { z } from 'zod/v4';

  const schema = z.object({
    sentiment: z.enum(['positive', 'negative', 'neutral']),
    score: z.number(),
    topics: z.array(z.string()),
    summary: z.string(),
  });

  const analysis = new StructuredStream({ schema });
</script>

<button onclick={() => analysis.send('Analyze: I love this product!')}>
  Analyze
</button>

{#if analysis.partial}
  <p>Sentiment: {analysis.partial.sentiment}</p>
  <p>Score: {analysis.partial.score}</p>
  <p>Topics: {analysis.partial.topics?.join(', ')}</p>
{/if}
```

### Next.js / React

```tsx
"use client";

import { useStructuredStream } from "@aibind/nextjs";
import { z } from "zod/v4";

const schema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  score: z.number(),
  topics: z.array(z.string()),
  summary: z.string(),
});

function Analysis() {
  const { partial, data, loading, send } = useStructuredStream({ schema });

  return (
    <div>
      <button onClick={() => send("Analyze: I love this product!")} disabled={loading}>
        Analyze
      </button>
      {partial && (
        <div>
          <p>Sentiment: {partial.sentiment}</p>
          <p>Score: {partial.score}</p>
          <p>Topics: {partial.topics?.join(", ")}</p>
        </div>
      )}
    </div>
  );
}
```

### Nuxt / Vue

```vue
<script setup lang="ts">
import { useStructuredStream } from "@aibind/nuxt";
import { z } from "zod/v4";

const schema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  score: z.number(),
  topics: z.array(z.string()),
  summary: z.string(),
});

const { partial, data, loading, send } = useStructuredStream({ schema });
</script>

<template>
  <button @click="send('Analyze: I love this product!')" :disabled="loading">
    Analyze
  </button>
  <div v-if="partial">
    <p>Sentiment: {{ partial.sentiment }}</p>
    <p>Score: {{ partial.score }}</p>
    <p>Topics: {{ partial.topics?.join(', ') }}</p>
  </div>
</template>
```

### SolidStart

```tsx
import { useStructuredStream } from "@aibind/solidstart";
import { z } from "zod/v4";

const schema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  score: z.number(),
  topics: z.array(z.string()),
  summary: z.string(),
});

function Analysis() {
  const { partial, data, loading, send } = useStructuredStream({ schema });

  return (
    <div>
      <button onClick={() => send("Analyze: I love this product!")} disabled={loading()}>
        Analyze
      </button>
      <Show when={partial()}>
        <p>Sentiment: {partial()?.sentiment}</p>
        <p>Score: {partial()?.score}</p>
        <p>Topics: {partial()?.topics?.join(", ")}</p>
      </Show>
    </div>
  );
}
```

### TanStack Start

```tsx
import { useStructuredStream } from "@aibind/tanstack-start";
import { z } from "zod/v4";

const schema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  score: z.number(),
  topics: z.array(z.string()),
  summary: z.string(),
});

function Analysis() {
  const { partial, data, loading, send } = useStructuredStream({ schema });

  return (
    <div>
      <button onClick={() => send("Analyze: I love this product!")} disabled={loading}>
        Analyze
      </button>
      {partial && (
        <div>
          <p>Sentiment: {partial.sentiment}</p>
          <p>Score: {partial.score}</p>
          <p>Topics: {partial.topics?.join(", ")}</p>
        </div>
      )}
    </div>
  );
}
```

## Returned State

| Property  | Type                     | Description                      |
| --------- | ------------------------ | -------------------------------- |
| `data`    | `T \| null`              | Validated final result           |
| `partial` | `DeepPartial<T> \| null` | Partial data as it streams       |
| `raw`     | `string`                 | Raw JSON string                  |
| `loading` | `boolean`                | Whether streaming is in progress |
| `done`    | `boolean`                | Whether streaming finished       |
| `error`   | `Error \| null`          | Validation or network errors     |

## Schema Resolution

aibind supports multiple schema libraries through Standard Schema:

```ts
// Zod
import { z } from "zod/v4";
const schema = z.object({ name: z.string() });

// Valibot
import * as v from "valibot";
const schema = v.object({ name: v.string() });
```

The JSON schema is resolved once and cached. If your schema has a `toJsonSchema()` method, aibind uses that. Otherwise it reads from `~standard.jsonSchema`.

## Reactivity by Framework

| Framework | Access pattern | Example |
|-----------|---------------|---------|
| Svelte    | Direct property | `analysis.partial` |
| React     | Direct value | `partial` (from hook) |
| Vue       | `.value` | `partial.value` |
| Solid     | Function call | `partial()` |
