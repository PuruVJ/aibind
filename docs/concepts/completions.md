# Inline Completions

Ghost-text completions as the user types — a different interaction model from chat. Useful for writing assistants, search boxes, code inputs, and anywhere you want to predict what the user is about to say.

## How It Works

1. User types → `completion.update(input)` is called
2. After a debounce delay (default 300ms), a `POST /__aibind__/complete` request fires with the current input
3. The server returns just the continuation (not the input itself)
4. `completion.suggestion` holds the ghost text tail
5. User presses Tab → `completion.accept()` returns `input + suggestion`

The request is automatically cancelled on each keystroke and re-fired after the debounce. If the user types faster than the debounce, only one request goes out.

## Server Setup

No extra configuration needed — `createStreamHandler` handles `/complete` automatically:

```ts
// hooks.server.ts / app/api/ai/[...path]/route.ts
export const handle = createStreamHandler({ models });
// POST /__aibind__/complete is now available
```

The server uses `generateText` with a built-in continuation prompt. Pass `system` in the client options to override it.

## Usage

::: code-group

```svelte [SvelteKit]
<script lang="ts">
  import { Completion } from "@aibind/sveltekit";

  const completion = new Completion({ model: "fast" });
  let input = $state("");
</script>

<div style="position: relative">
  <input
    bind:value={input}
    oninput={() => completion.update(input)}
    onkeydown={(e) => {
      if (e.key === "Tab" && completion.suggestion) {
        input = completion.accept();
        e.preventDefault();
      }
      if (e.key === "Escape") completion.clear();
    }}
  />
  <!-- Ghost text overlay (style to match your input) -->
  {#if completion.suggestion}
    <span class="ghost">{input}<span class="suggestion">{completion.suggestion}</span></span>
  {/if}
</div>

<style>
  .ghost {
    position: absolute;
    inset: 0;
    pointer-events: none;
    color: transparent;
  }
  .suggestion {
    color: #999;
  }
</style>
```

```tsx [Next.js]
"use client";

import { useCompletion } from "@aibind/nextjs";
import { useRef } from "react";

export default function Writer() {
  const [input, setInput] = useState("");
  const { suggestion, update, accept, clear } = useCompletion({ model: "fast" });

  return (
    <div style={{ position: "relative" }}>
      <input
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          update(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Tab" && suggestion) {
            setInput(accept());
            e.preventDefault();
          }
          if (e.key === "Escape") clear();
        }}
      />
      {suggestion && (
        <span className="ghost">
          {input}<span className="suggestion">{suggestion}</span>
        </span>
      )}
    </div>
  );
}
```

```vue [Nuxt]
<script setup lang="ts">
import { useCompletion } from "@aibind/nuxt";
import { ref } from "vue";

const input = ref("");
const { suggestion, update, accept, clear } = useCompletion({ model: "fast" });

function onInput(e: Event) {
  input.value = (e.target as HTMLInputElement).value;
  update(input.value);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Tab" && suggestion.value) {
    input.value = accept();
    e.preventDefault();
  }
  if (e.key === "Escape") clear();
}
</script>

<template>
  <div style="position: relative">
    <input :value="input" @input="onInput" @keydown="onKeydown" />
    <span v-if="suggestion" class="ghost">
      {{ input }}<span class="suggestion">{{ suggestion }}</span>
    </span>
  </div>
</template>
```

```tsx [SolidStart]
import { useCompletion } from "@aibind/solidstart";
import { createSignal } from "solid-js";

function Writer() {
  const [input, setInput] = createSignal("");
  const { suggestion, update, accept, clear } = useCompletion({ model: "fast" });

  return (
    <div style={{ position: "relative" }}>
      <input
        value={input()}
        onInput={(e) => {
          setInput(e.currentTarget.value);
          update(e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Tab" && suggestion()) {
            setInput(accept());
            e.preventDefault();
          }
          if (e.key === "Escape") clear();
        }}
      />
      {suggestion() && (
        <span class="ghost">
          {input()}<span class="suggestion">{suggestion()}</span>
        </span>
      )}
    </div>
  );
}
```

:::

## API Reference

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `endpoint` | `string` | `/__aibind__/complete` | Server endpoint |
| `model` | `string` | — | Model key to use |
| `system` | `string` | built-in continuation prompt | Override server system prompt |
| `debounce` | `number` | `300` | Delay in ms before firing |
| `minLength` | `number` | `3` | Min input chars to trigger |
| `fetch` | `typeof fetch` | `globalThis.fetch` | Custom fetch |
| `onFinish` | `(suggestion: string) => void` | — | Called when suggestion arrives |
| `onError` | `(error: Error) => void` | — | Called on request error |

### Reactive State

| Property | Type | Description |
|----------|------|-------------|
| `suggestion` | `string` | Current ghost text (continuation only, not input) |
| `loading` | `boolean` | Request in-flight |
| `error` | `Error \| null` | Last error |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `update(input)` | `void` | Call on every input change. Debounced. |
| `accept()` | `string` | Returns `lastInput + suggestion`, clears state |
| `clear()` | `void` | Dismiss suggestion without accepting |
| `abort()` | `void` | Cancel debounce and in-flight request |

## Custom System Prompt

Override the built-in continuation prompt for your domain:

```ts
const completion = new Completion({
  model: "fast",
  system: "Complete the following search query naturally. Output only the completion.",
});
```

## Custom Endpoint

For custom routing or auth middleware:

```ts
const completion = new Completion({
  endpoint: "/api/ai/complete",
  model: "fast",
});
```

On the server, call `StreamHandler.complete()` directly:

```ts
// Hono
app.post("/api/ai/complete", async (c) => ai.complete(await c.req.json()));

// Next.js with auth
export async function POST(request: Request) {
  const session = await getSession(request);
  if (!session) return new Response("Unauthorized", { status: 401 });
  return ai.complete(await request.json());
}
```
