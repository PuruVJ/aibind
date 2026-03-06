# Model Racing

Send the same prompt to multiple models simultaneously. The winner — determined by your chosen strategy — updates reactive state; losers are cancelled automatically.

## How It Works

All models receive the same request at the same time. Two strategies determine the winner:

- **`"complete"`** (default) — first model whose stream finishes wins. You get the full response at once.
- **`"first-token"`** — first model to emit any text wins. That model's response streams live; all others are aborted immediately.

`race.winner` is `null` while racing, then set to the winning model key once decided.

## Setup

::: code-group

```svelte [SvelteKit]
<script lang="ts">
  import { Race } from "@aibind/sveltekit";

  const race = new Race({
    models: ["fast", "smart"],
    strategy: "first-token",
  });
</script>

<button onclick={() => race.send("Summarize this")}>Race</button>
{#if race.winner}<small>won by {race.winner}</small>{/if}
<p>{race.text}</p>
```

```tsx [Next.js]
"use client";
import { useRace } from "@aibind/nextjs";

export default function Chat() {
  const { text, winner, send } = useRace({
    models: ["fast", "smart"],
    strategy: "first-token",
  });

  return (
    <>
      <button onClick={() => send("Summarize this")}>Race</button>
      {winner && <small>won by {winner}</small>}
      <p>{text}</p>
    </>
  );
}
```

```vue [Nuxt]
<script setup lang="ts">
import { useRace } from "@aibind/nuxt";

const { text, winner, send } = useRace({
  models: ["fast", "smart"],
  strategy: "first-token",
});
</script>

<template>
  <button @click="send('Summarize this')">Race</button>
  <small v-if="winner">won by {{ winner }}</small>
  <p>{{ text }}</p>
</template>
```

```tsx [SolidStart]
import { useRace } from "@aibind/solidstart";

export default function Chat() {
  const { text, winner, send } = useRace({
    models: ["fast", "smart"],
    strategy: "first-token",
  });

  return (
    <>
      <button onClick={() => send("Summarize this")}>Race</button>
      {winner() && <small>won by {winner()}</small>}
      <p>{text()}</p>
    </>
  );
}
```

:::

## Strategies

### `"complete"` — first to finish

The default. All models stream in the background silently. When one finishes, it wins — `race.text` is set to the full response at once and `race.done` becomes true. Good when you want the shortest total wait time regardless of which model is fastest per-token.

```ts
const race = new Race({
  models: ["fast", "smart", "reason"],
  strategy: "complete",
});
```

### `"first-token"` — first to produce any output

The moment any model emits its first token, that model is elected winner and its output streams live. All others are cancelled. This minimises time-to-first-token — the UX feels instant because you're always committing to whoever responds first, then streaming their full output.

```ts
const race = new Race({
  models: ["fast", "smart"],
  strategy: "first-token",
});
```

## Type-safe model keys

Pass your model key type as a generic to get type checking on `models` and `race.winner`:

::: code-group

```svelte [SvelteKit]
<script lang="ts">
  import { Race } from "@aibind/sveltekit";

  type ModelKey = "fast" | "smart" | "reason";

  const race = new Race<ModelKey>({
    models: ["fast", "smart"],
    strategy: "first-token",
  });
  // race.winner is typed as ModelKey | null
</script>
```

```tsx [Next.js]
type ModelKey = "fast" | "smart" | "reason";

const { winner } = useRace<ModelKey>({
  models: ["fast", "smart"],
  strategy: "first-token",
});
// winner is typed as ModelKey | null
```

:::

## Callbacks

```ts
const race = new Race({
  models: ["fast", "smart"],
  onFinish: (text, winner) => {
    console.log(`${winner} won with: ${text.slice(0, 80)}...`);
    analytics.track("race_winner", { winner });
  },
  onError: (err) => {
    // fires only if ALL models fail
    console.error(err);
  },
});
```

`onError` fires only when every model fails — if at least one succeeds, it's treated as a win.

## Aborting

```ts
// Cancel all in-flight requests
race.abort();
```

Calling `abort()` cancels all running model requests immediately. `race.loading` becomes `false`.

## API Reference

### Constructor options

| Option     | Type                          | Default            | Description                                                 |
| ---------- | ----------------------------- | ------------------ | ----------------------------------------------------------- |
| `models`   | `M[]`                         | required           | Models to race. All receive the same prompt simultaneously. |
| `endpoint` | `string`                      | required           | Server endpoint. Same one used by `Stream`.                 |
| `strategy` | `"complete" \| "first-token"` | `"complete"`       | How to pick the winner.                                     |
| `system`   | `string`                      | —                  | System prompt sent to all models.                           |
| `fetch`    | `typeof fetch`                | `globalThis.fetch` | Custom fetch implementation.                                |
| `onFinish` | `(text, winner) => void`      | —                  | Called when a winner is decided and their stream completes. |
| `onError`  | `(error) => void`             | —                  | Called only if all models fail.                             |

### Reactive state

| Property  | Type            | Description                                                         |
| --------- | --------------- | ------------------------------------------------------------------- |
| `text`    | `string`        | The winning model's response. Empty until a winner produces output. |
| `loading` | `boolean`       | `true` while any model is still competing.                          |
| `done`    | `boolean`       | `true` once the winner's stream has fully completed.                |
| `error`   | `Error \| null` | Set only if all models fail.                                        |
| `winner`  | `M \| null`     | The winning model key. `null` until decided.                        |

### Methods

| Method                   | Description                                       |
| ------------------------ | ------------------------------------------------- |
| `send(prompt, options?)` | Start a race. Cancels any in-progress race first. |
| `abort()`                | Cancel all in-flight requests immediately.        |
