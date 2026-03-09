# Chat

High-level conversational hook for multi-turn chat. Manages the messages array, streams assistant replies token-by-token, and provides built-in helpers for editing and regenerating messages.

## Quickstart

::: code-group

```svelte [SvelteKit]
<script lang="ts">
  import { Chat } from "@aibind/sveltekit";

  const chat = new Chat({ model: "smart" });
  let input = $state("");
</script>

{#each chat.messages as msg}
  <div class={msg.role}>{msg.content}</div>
{/each}

{#if chat.loading}
  <span class="cursor">▌</span>
{/if}

<form onsubmit={(e) => { e.preventDefault(); chat.send(input); input = ""; }}>
  <input bind:value={input} placeholder="Ask something…" />
  <button disabled={chat.loading}>Send</button>
</form>
```

```tsx [Next.js / React]
"use client";
import { useChat } from "@aibind/nextjs"; // or @aibind/react
import { useState } from "react";

export default function ChatPage() {
  const { messages, send, loading } = useChat({ model: "smart" });
  const [input, setInput] = useState("");

  return (
    <>
      {messages.map((msg) => (
        <div key={msg.id} className={msg.role}>{msg.content}</div>
      ))}
      {loading && <span className="cursor">▌</span>}
      <form onSubmit={(e) => { e.preventDefault(); send(input); setInput(""); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} />
        <button disabled={loading}>Send</button>
      </form>
    </>
  );
}
```

```vue [Nuxt / Vue]
<script setup lang="ts">
import { useChat } from "@aibind/nuxt"; // or @aibind/vue
import { ref } from "vue";

const { messages, send, loading } = useChat({ model: "smart" });
const input = ref("");
</script>

<template>
  <div v-for="msg in messages" :key="msg.id" :class="msg.role">
    {{ msg.content }}
  </div>
  <span v-if="loading" class="cursor">▌</span>
  <form @submit.prevent="send(input); input = ''">
    <input v-model="input" placeholder="Ask something…" />
    <button :disabled="loading">Send</button>
  </form>
</template>
```

```tsx [SolidStart / Solid]
import { useChat } from "@aibind/solidstart"; // or @aibind/solid
import { createSignal } from "solid-js";

export default function ChatPage() {
  const { messages, send, loading } = useChat({ model: "smart" });
  const [input, setInput] = createSignal("");

  return (
    <>
      <For each={messages()}>
        {(msg) => <div class={msg.role}>{msg.content}</div>}
      </For>
      {loading() && <span class="cursor">▌</span>}
      <form onSubmit={(e) => { e.preventDefault(); send(input()); setInput(""); }}>
        <input value={input()} onInput={(e) => setInput(e.currentTarget.value)} />
        <button disabled={loading()}>Send</button>
      </form>
    </>
  );
}
```

:::

## API

### Options

```ts
interface ChatOptions {
  model?: string;        // model key passed to your StreamHandler
  system?: string;       // system prompt sent with every request
  endpoint?: string;     // defaults to /__aibind__/chat
  fetch?: typeof fetch;  // custom fetch implementation
  onFinish?: (messages: ChatMessage[]) => void;
  onError?: (error: Error) => void;
}
```

### Reactive state

| Property | Type | Description |
|----------|------|-------------|
| `messages` | `ChatMessage[]` | Full conversation history. Each message has `id`, `role`, and `content`. |
| `loading` | `boolean` | `true` while the assistant is streaming. |
| `error` | `Error \| null` | Last error, or `null`. |
| `status` | `StreamStatus` | `"idle"` / `"streaming"` / `"done"` / `"error"` |
| `hasOptimistic` | `boolean` | `true` when any message in the array is still optimistic (unconfirmed). |

### Methods

| Method | Description |
|--------|-------------|
| `send(text)` | Append a user message and stream the assistant reply. No-op if `text` is empty or loading. |
| `abort()` | Cancel the in-flight request. The partial assistant message stays in history. |
| `clear()` | Reset to empty conversation. |
| `regenerate()` | Remove the last assistant reply (and its user turn) and re-send the same user message. |
| `edit(id, text)` | Truncate history from message `id` onwards and re-send `text` as a new user turn. |
| `revert()` | Abort the current request, remove the last user+assistant pair, and return the user's text. Returns `null` if nothing to revert. |
| `optimistic(text)` | Stage a user+assistant message pair immediately without making a request. Returns a [`StagedMessage`](#stagedmessage) handle. |

### `ChatMessage` type

```ts
interface ChatMessage {
  id: string;                      // stable UUID, assigned on creation
  role: "user" | "assistant";
  content: string;                 // accumulates during streaming
  optimistic?: boolean;            // true until the request is confirmed
}
```

### `StagedMessage`

The handle returned by `chat.optimistic(text)`:

```ts
interface StagedMessage {
  send(): void;    // start streaming — commits the staged pair
  cancel(): void;  // remove the staged pair from messages[]
}
```

Both methods are idempotent. Calling `send()` after `cancel()` (or vice versa) is a no-op.

## Server setup

`Chat` sends `POST /__aibind__/chat` with `{ messages, system?, model? }`. Your `StreamHandler` handles this automatically — no extra setup needed beyond the standard handler.

::: code-group

```ts [SvelteKit — hooks.server.ts]
import { createStreamHandler } from "@aibind/sveltekit/server";
import { models } from "./models.server";

export const handle = createStreamHandler({ models });
```

```ts [Next.js — app/api/route.ts]
import { createStreamHandler } from "@aibind/nextjs/server";
import { models } from "@/lib/models";

const handler = createStreamHandler({ models });
export const POST = handler.handle;
```

:::

## Edit and regenerate

The two most common chat UI actions work out of the box:

```svelte [SvelteKit]
<script lang="ts">
  import { Chat } from "@aibind/sveltekit";
  import type { ChatMessage } from "@aibind/sveltekit";

  const chat = new Chat({ model: "smart" });

  let editingId = $state<string | null>(null);
  let editText = $state("");
</script>

{#each chat.messages as msg}
  <div class={msg.role}>
    {#if editingId === msg.id}
      <input bind:value={editText} />
      <button onclick={() => { chat.edit(msg.id, editText); editingId = null; }}>
        Save & Resend
      </button>
    {:else}
      <p>{msg.content}</p>
      {#if msg.role === "user"}
        <button onclick={() => { editingId = msg.id; editText = msg.content; }}>
          Edit
        </button>
      {:else}
        <button onclick={() => chat.regenerate()} disabled={chat.loading}>
          Regenerate
        </button>
      {/if}
    {/if}
  </div>
{/each}
```

`edit(id, text)` truncates history from the edited message forward and re-sends the new text. `regenerate()` removes the last assistant reply and its paired user message, then re-sends the same user prompt.

## Optimistic UI

`chat.send(text)` is fire-and-forget — the user message appears in `messages[]` instantly and streaming begins. For most apps that's enough.

For flows where you need to **show the message first, then decide whether to send** — e.g. uploading a file attachment before streaming, showing a confirmation step, or triggering send from a different event — use `chat.optimistic(text)`:

```svelte [SvelteKit]
<script lang="ts">
  import { Chat } from "@aibind/sveltekit";
  import type { StagedMessage } from "@aibind/sveltekit";

  const chat = new Chat({ model: "smart" });

  let staged: StagedMessage | null = $state(null);
  let input = $state("");

  function stage() {
    const text = input.trim();
    if (!text) return;
    input = "";
    staged = chat.optimistic(text); // message appears immediately, no request yet
  }

  function confirm() {
    staged?.send(); // start streaming
    staged = null;
  }

  function cancel() {
    staged?.cancel(); // remove the message
    staged = null;
  }
</script>

{#each chat.messages as msg (msg.id)}
  <div class={msg.role} style:opacity={msg.optimistic ? 0.5 : 1}>
    {msg.content}
  </div>
{/each}

{#if staged}
  <div class="confirm-bar">
    <button onclick={confirm}>Send</button>
    <button onclick={cancel}>Discard</button>
  </div>
{:else}
  <form onsubmit={(e) => { e.preventDefault(); stage(); }}>
    <input bind:value={input} />
    <button type="submit">Stage</button>
  </form>
{/if}
```

Optimistic messages have `msg.optimistic === true` until the first streaming chunk arrives — use this to render a pending state (dimmed opacity, spinner, etc.). Once streaming starts the flag is cleared automatically.

### Undo send with `revert()`

`revert()` aborts the current request, removes the last user+assistant pair from `messages[]`, and returns the user's original text so you can put it back in the input:

```svelte
{#if chat.error}
  <div class="error">
    {chat.error.message}
    <button onclick={() => { input = chat.revert() ?? input; }}>
      Undo send
    </button>
  </div>
{/if}
```

This is different from `abort()`: `abort()` stops streaming but leaves the messages in place. `revert()` removes them entirely.

## System prompt per session

Pass `system` to set a persistent instruction for the whole conversation:

```svelte
<script lang="ts">
  import { Chat } from "@aibind/sveltekit";

  const chat = new Chat({
    model: "smart",
    system: "You are a concise technical assistant. Reply in plain text only.",
  });
</script>
```

## Framework access patterns

::: code-group

```ts [SvelteKit]
import { Chat } from "@aibind/sveltekit";
import type { ChatMessage, StagedMessage } from "@aibind/sveltekit";
// Instantiate in <script> — lifecycle tied to component
const chat = new Chat({ model: "smart" });
```

```ts [Next.js]
import { useChat } from "@aibind/nextjs";
import type { ChatMessage, StagedMessage } from "@aibind/nextjs";
```

```ts [React Router v7]
import { useChat } from "@aibind/react-router";
import type { StagedMessage } from "@aibind/react-router";
```

```ts [TanStack Start]
import { useChat } from "@aibind/tanstack-start";
import type { StagedMessage } from "@aibind/tanstack-start";
```

```ts [Nuxt / Vue]
import { useChat } from "@aibind/nuxt";
import type { ChatMessage, StagedMessage } from "@aibind/nuxt";
```

```ts [SolidStart / Solid]
import { useChat } from "@aibind/solidstart";
import type { ChatMessage, StagedMessage } from "@aibind/solidstart";
```

:::
