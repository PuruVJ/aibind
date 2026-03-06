# Streaming Diff

Show exactly what changed between responses — word-level diff highlights populated after every regenerate, retry, or subsequent send.

## How It Works

`stream.diff` is `null` on the first send. On every subsequent send, once the stream completes, it's populated with a `DiffChunk[]` comparing the previous response to the new one.

While streaming: `stream.text` is live, `stream.diff` stays `null`.
After done: `stream.diff` is populated.

## Setup

Import and pass `defaultDiff` (built-in word-level diff, zero dependencies) or your own function:

::: code-group

```svelte [SvelteKit]
<script lang="ts">
  import { Stream, defaultDiff } from "@aibind/sveltekit";

  const stream = new Stream({ model: "smart", diff: defaultDiff });
</script>

<button onclick={() => stream.send("Explain gravity")}>Send</button>
<button onclick={() => stream.retry()}>Regenerate</button>

{#if stream.diff}
  {#each stream.diff as chunk}
    {#if chunk.type === "keep"}
      <span>{chunk.text}</span>
    {:else if chunk.type === "add"}
      <ins>{chunk.text}</ins>
    {:else}
      <del>{chunk.text}</del>
    {/if}
  {/each}
{:else}
  <p>{stream.text}</p>
{/if}
```

```tsx [Next.js]
"use client";
import { useStream, defaultDiff } from "@aibind/nextjs";

export default function Chat() {
  const { text, diff, send, retry } = useStream({
    model: "smart",
    diff: defaultDiff,
  });

  return (
    <>
      <button onClick={() => send("Explain gravity")}>Send</button>
      <button onClick={() => retry()}>Regenerate</button>
      {diff ? (
        <p>
          {diff.map((chunk, i) =>
            chunk.type === "keep" ? (
              <span key={i}>{chunk.text}</span>
            ) : chunk.type === "add" ? (
              <ins key={i}>{chunk.text}</ins>
            ) : (
              <del key={i}>{chunk.text}</del>
            ),
          )}
        </p>
      ) : (
        <p>{text}</p>
      )}
    </>
  );
}
```

```vue [Nuxt]
<script setup lang="ts">
import { useStream, defaultDiff } from "@aibind/nuxt";

const { text, diff, send, retry } = useStream({
  model: "smart",
  diff: defaultDiff,
});
</script>

<template>
  <button @click="send('Explain gravity')">Send</button>
  <button @click="retry()">Regenerate</button>
  <p v-if="diff">
    <template v-for="chunk in diff" :key="chunk.text">
      <span v-if="chunk.type === 'keep'">{{ chunk.text }}</span>
      <ins v-else-if="chunk.type === 'add'">{{ chunk.text }}</ins>
      <del v-else>{{ chunk.text }}</del>
    </template>
  </p>
  <p v-else>{{ text }}</p>
</template>
```

```tsx [SolidStart]
import { useStream, defaultDiff } from "@aibind/solidstart";
import { For, Show } from "solid-js";

export default function Chat() {
  const { text, diff, send, retry } = useStream({
    model: "smart",
    diff: defaultDiff,
  });

  return (
    <>
      <button onClick={() => send("Explain gravity")}>Send</button>
      <button onClick={() => retry()}>Regenerate</button>
      <Show when={diff()} fallback={<p>{text()}</p>}>
        <p>
          <For each={diff()!}>
            {(chunk) =>
              chunk.type === "keep" ? (
                <span>{chunk.text}</span>
              ) : chunk.type === "add" ? (
                <ins>{chunk.text}</ins>
              ) : (
                <del>{chunk.text}</del>
              )
            }
          </For>
        </p>
      </Show>
    </>
  );
}
```

:::

## Plug In Your Own Diff Library

`diff` accepts any function `(prev: string, next: string) => DiffChunk[]`. One-liner adapters for every major library:

### `diff` (JSDiff) — word-level, most popular

```ts
import { diffWords } from "diff";

const stream = new Stream({
  model: "smart",
  diff: (prev, next) =>
    diffWords(prev, next).map((c) => ({
      type: c.added ? "add" : c.removed ? "remove" : "keep",
      text: c.value,
    })),
});
```

### `fast-diff` — character-level, 1.5kB

```ts
import diff from "fast-diff";

const stream = new Stream({
  model: "smart",
  diff: (prev, next) =>
    diff(prev, next).map(([op, text]) => ({
      type: op === 1 ? "add" : op === -1 ? "remove" : "keep",
      text,
    })),
});
```

### `diff-match-patch` — semantic cleanup available

```ts
import { diff_match_patch, DIFF_INSERT, DIFF_DELETE } from "diff-match-patch";

const dmp = new diff_match_patch();

const stream = new Stream({
  model: "smart",
  diff: (prev, next) => {
    const diffs = dmp.diff_main(prev, next);
    dmp.diff_cleanupSemantic(diffs); // optional — improves readability
    return diffs.map(([op, text]) => ({
      type: op === DIFF_INSERT ? "add" : op === DIFF_DELETE ? "remove" : "keep",
      text,
    }));
  },
});
```

## Built-in `defaultDiff`

`defaultDiff` is a word-level LCS diff with no dependencies. It splits on whitespace boundaries, runs standard O(m·n) LCS, and merges adjacent same-type chunks.

Good for: typical AI response sizes (< ~2,000 words).
For very long outputs or semantic-quality diffs, use `diff` with `diffSentences` or `diff-match-patch` with `diff_cleanupSemantic`.

## API Reference

### Option

| Option | Type     | Description                                                                                                                |
| ------ | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `diff` | `DiffFn` | Function called after every completed stream to compute the diff. Pass `defaultDiff` or your own adapter. Omit to disable. |

### `DiffChunk`

```ts
interface DiffChunk {
  type: "keep" | "add" | "remove";
  text: string;
}
```

### `DiffFn`

```ts
type DiffFn = (prev: string, next: string) => DiffChunk[];
```

### Reactive state

| Property                 | Type                  | Description                                                                                            |
| ------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------ |
| `stream.diff` / `diff()` | `DiffChunk[] \| null` | `null` on first send or while streaming. Populated once stream is done and a previous response exists. |
