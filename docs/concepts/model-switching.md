# Model Switching

Switch between AI models at runtime — either persistently for all future sends, or one-off for a single request.

## Defining Models

Use `defineModels` to create a typed map of named models:

```ts
// src/lib/models.server.ts
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { defineModels } from "@aibind/sveltekit/server";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export const models = defineModels({
  fast: openrouter("google/gemini-3.1-flash-lite-preview"),
  smart: openrouter("anthropic/claude-sonnet-4-6"),
  reason: openrouter("google/gemini-2.5-pro"),
});

export type ModelKey = keyof typeof models; // "fast" | "smart" | "reason"
```

## Persistent Switch

Change the model for all future sends:

::: code-group

```svelte [SvelteKit]
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";
  import type { ModelKey } from "$lib/models.server";

  const stream = new Stream<ModelKey>({ model: "fast" });
</script>

<select bind:value={stream.model}>
  <option value="fast">Fast</option>
  <option value="smart">Smart</option>
  <option value="reason">Reason</option>
</select>

<p>Current model: {stream.model}</p>
<button onclick={() => stream.send("Hello!")}>Send</button>
<p>{stream.text}</p>
```

```tsx [Next.js]
"use client";

import { useStream } from "@aibind/nextjs";
import type { ModelKey } from "@/lib/models.server";

export default function Chat() {
  const { text, model, setModel, send } = useStream<ModelKey>({
    model: "fast",
  });

  return (
    <div>
      <select
        value={model}
        onChange={(e) => setModel(e.target.value as ModelKey)}
      >
        <option value="fast">Fast</option>
        <option value="smart">Smart</option>
        <option value="reason">Reason</option>
      </select>
      <button onClick={() => send("Hello!")}>Send</button>
      <p>{text}</p>
    </div>
  );
}
```

```vue [Nuxt]
<script setup lang="ts">
import { useStream } from "@aibind/nuxt";
import type { ModelKey } from "~/server/models";

const { text, model, setModel, send } = useStream<ModelKey>({ model: "fast" });
</script>

<template>
  <select :value="model" @change="setModel(($event.target as any).value)">
    <option value="fast">Fast</option>
    <option value="smart">Smart</option>
    <option value="reason">Reason</option>
  </select>
  <button @click="send('Hello!')">Send</button>
  <p>{{ text }}</p>
</template>
```

```tsx [SolidStart]
import { useStream } from "@aibind/solidstart";
import type { ModelKey } from "~/server/models";

function Chat() {
  const { text, model, setModel, send } = useStream<ModelKey>({
    model: "fast",
  });

  return (
    <div>
      <select
        value={model()}
        onInput={(e) => setModel(e.currentTarget.value as ModelKey)}
      >
        <option value="fast">Fast</option>
        <option value="smart">Smart</option>
        <option value="reason">Reason</option>
      </select>
      <button onClick={() => send("Hello!")}>Send</button>
      <p>{text()}</p>
    </div>
  );
}
```

```tsx [TanStack Start]
import { useStream } from "@aibind/tanstack-start";
import type { ModelKey } from "~/lib/models.server";

function Chat() {
  const { text, model, setModel, send } = useStream<ModelKey>({
    model: "fast",
  });

  return (
    <div>
      <select
        value={model}
        onChange={(e) => setModel(e.target.value as ModelKey)}
      >
        <option value="fast">Fast</option>
        <option value="smart">Smart</option>
        <option value="reason">Reason</option>
      </select>
      <button onClick={() => send("Hello!")}>Send</button>
      <p>{text}</p>
    </div>
  );
}
```

:::

## Per-Send Override

Use a different model for a single request without changing the default:

```ts
// All frameworks: pass model in send() options
stream.send("Explain this in detail", { model: "smart" });
// Next send() will use the persistent model again
```

```tsx
// React
const { send } = useStream<ModelKey>({ model: "fast" });

send("Quick answer"); // uses "fast"
send("Deep analysis", { model: "reason" }); // uses "reason" for this one
send("Another question"); // back to "fast"
```

## Model Routing

Instead of manually picking a model per send, define a `routeModel` function once — it's called automatically before every request:

```ts
import { Stream } from "@aibind/sveltekit";
import type { ModelKey } from "$lib/models.server";

const stream = new Stream<ModelKey>({
  routeModel: (prompt) => {
    if (prompt.length < 200) return "fast";
    if (/\b(why|analyze|explain|compare)\b/i.test(prompt)) return "reason";
    return "smart";
  },
});

stream.send("Hi");                           // → "fast"
stream.send("Explain quantum entanglement"); // → "reason"
stream.send("Write a cover letter");         // → "smart"
```

Works identically across all frameworks — `routeModel` is part of `StreamOptions<M>`.

Explicit per-send override still takes priority — the router is skipped entirely:

```ts
stream.send("Quick one", { model: "fast" }); // router not called
```

**Priority (highest → lowest):**
1. Explicit `model` in `send()` options
2. `routeModel(prompt)` return value
3. Constructor `model` default

### `routeByLength` utility

For the most common routing strategy — short prompts to cheap models, long to powerful — import the built-in utility:

```ts
import { routeByLength } from "@aibind/core";
import type { ModelKey } from "$lib/models.server";

const stream = new Stream<ModelKey>({
  routeModel: routeByLength(
    [
      { maxLength: 200, model: "fast" },
      { maxLength: 800, model: "smart" },
    ],
    "reason", // fallback for prompts longer than 800 chars
  ),
});
```

Rules are evaluated in ascending `maxLength` order. The first rule where `prompt.length <= maxLength` wins; `fallback` is used if none match.

### Async routing

`routeModel` can be async — useful for routing based on user context:

```ts
const stream = new Stream<ModelKey>({
  routeModel: async (prompt) => {
    const tier = await getUserTier(userId);
    return tier === "premium" ? "smart" : "fast";
  },
});
```

## Type Safety

The generic `M` parameter flows through from `defineModels` to the hook/class, so TypeScript catches invalid model names:

```ts
const { setModel } = useStream<ModelKey>({ model: "fast" });

setModel("smart"); // OK
setModel("reason"); // OK
setModel("turbo"); // TypeScript error: not in ModelKey
```

## UseStreamReturn&lt;M&gt; Properties

| Property   | Type                 | Description              |
| ---------- | -------------------- | ------------------------ |
| `model`    | `M \| undefined`     | Current persistent model |
| `setModel` | `(model: M) => void` | Change persistent model  |

`send()` accepts an optional second argument:

```ts
send(prompt: string, opts?: {
  system?: string;  // override system prompt for this send
  model?: M;        // override model for this send
})
```
