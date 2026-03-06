# Token & Cost Tracking

`UsageTracker` accumulates token counts and cost across every stream turn. Pass it to one or more streams and it updates automatically after each completed response.

## Setup

::: code-group

```svelte [SvelteKit]
<script lang="ts">
  import { Stream, UsageTracker } from "@aibind/sveltekit";

  const tracker = new UsageTracker({
    pricing: {
      fast: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
      smart: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
    },
  });

  const stream = new Stream({ model: "fast", tracker });
</script>

<button onclick={() => stream.send("Hello!")}>Send</button>
<p>
  {tracker.inputTokens + tracker.outputTokens} tokens · ${tracker.cost.toFixed(
    4,
  )}
</p>
```

```tsx [Next.js]
"use client";
import { useStream, useUsageTracker } from "@aibind/nextjs";

export default function Chat() {
  const { tracker, inputTokens, outputTokens, cost } = useUsageTracker({
    pricing: {
      fast: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
      smart: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
    },
  });
  const { send } = useStream({ model: "fast", tracker });

  return (
    <>
      <button onClick={() => send("Hello!")}>Send</button>
      <p>
        {inputTokens + outputTokens} tokens · ${cost.toFixed(4)}
      </p>
    </>
  );
}
```

```vue [Nuxt]
<script setup lang="ts">
import { useStream, useUsageTracker } from "@aibind/nuxt";

const { tracker, inputTokens, outputTokens, cost } = useUsageTracker({
  pricing: {
    fast: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
    smart: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  },
});
const { send } = useStream({ model: "fast", tracker });
</script>

<template>
  <button @click="send('Hello!')">Send</button>
  <p>{{ inputTokens + outputTokens }} tokens · ${{ cost.toFixed(4) }}</p>
</template>
```

```tsx [SolidStart]
import { useStream, useUsageTracker } from "@aibind/solidstart";

export default function Chat() {
  const { tracker, inputTokens, outputTokens, cost } = useUsageTracker({
    pricing: {
      fast: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
      smart: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
    },
  });
  const { send } = useStream({ model: "fast", tracker });

  return (
    <>
      <button onClick={() => send("Hello!")}>Send</button>
      <p>
        {inputTokens() + outputTokens()} tokens · ${cost().toFixed(4)}
      </p>
    </>
  );
}
```

:::

The server must emit a `usage` SSE event for tracking to work. This happens automatically when using `createStreamHandler` — no extra configuration needed.

## Per-Turn History

`tracker.history` is an array of `TurnUsage` records, one per completed send:

```ts
tracker.history.forEach((turn) => {
  console.log(
    `${turn.model}: ${turn.inputTokens}in / ${turn.outputTokens}out — $${turn.cost.toFixed(5)}`,
  );
});
// fast: 42in / 318out — $0.00020
// smart: 61in / 892out — $0.01521
```

## Track Multiple Streams

Pass the same tracker to as many streams as you like — it accumulates across all of them:

```svelte
<script lang="ts">
  import { Stream, UsageTracker } from "@aibind/sveltekit";

  const tracker = new UsageTracker({ pricing: { ... } });

  const chat   = new Stream({ model: "smart", tracker });
  const search = new Stream({ model: "fast",  tracker });
  // tracker.cost = total across both
</script>
```

## Resetting

```ts
tracker.reset(); // zeroes all fields, clears history
```

## No Pricing? Just Count Tokens

`pricing` is optional. Without it, `tracker.cost` stays `0` but token counts still update:

```ts
const tracker = new UsageTracker(); // no pricing
// tracker.inputTokens and tracker.outputTokens still accumulate
```

## API Reference

### `UsageTrackerOptions`

| Option     | Type                           | Description                                                                                          |
| ---------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `pricing`  | `Record<string, ModelPricing>` | Per-model pricing. Keys match the model names passed to `Stream`. Omit to count tokens without cost. |
| `onUpdate` | `() => void`                   | Called after every `record()` and `reset()`. Frameworks wire this automatically.                     |

### `ModelPricing`

```ts
interface ModelPricing {
  inputPerMillion: number; // USD per 1M input tokens
  outputPerMillion: number; // USD per 1M output tokens
}
```

### `TurnUsage`

```ts
interface TurnUsage {
  model: string | undefined;
  inputTokens: number;
  outputTokens: number;
  cost: number; // USD, 0 if no pricing was provided
  timestamp: number; // Date.now() at time of record
}
```

### Reactive state

| Property       | Type          | Description                                    |
| -------------- | ------------- | ---------------------------------------------- |
| `inputTokens`  | `number`      | Total input tokens across all recorded turns.  |
| `outputTokens` | `number`      | Total output tokens across all recorded turns. |
| `cost`         | `number`      | Total cost in USD.                             |
| `turns`        | `number`      | Number of completed stream turns recorded.     |
| `history`      | `TurnUsage[]` | Full per-turn breakdown.                       |

### Methods

| Method    | Description                          |
| --------- | ------------------------------------ |
| `reset()` | Zero all counters and clear history. |
