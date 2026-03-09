# Chat

High-level conversational hook for multi-turn chat. Manages the messages array, streams assistant replies token-by-token, and provides built-in helpers for editing and regenerating messages.

## Why not Vercel AI SDK's `useChat`?

The AI SDK ships its own `useChat` hook. Here's what aibind's `Chat` adds on top:

|                            | Vercel `useChat` | aibind `Chat`                                  |
| -------------------------- | ---------------- | ---------------------------------------------- |
| **Message editing**        | ✗                | ✓ `chat.edit(id, newText)`                     |
| **Regeneration**           | ✗                | ✓ `chat.regenerate()`                          |
| **Branching history**      | ✗                | ✓ `ReactiveChatHistory`                        |
| **Tool calling**           | Client-side      | Server-side (toolsets)                         |
| **Optimistic messages**    | Manual           | ✓ `chat.optimistic()`                          |
| **Multimodal attachments** | ✗                | ✓ `fileToAttachment()`                         |
| **Framework support**      | React only       | SvelteKit, Next.js, Nuxt, SolidStart, TanStack |

The core difference: aibind treats the message list as a **tree**, not an array. That's what makes edit, regenerate, and branching work without custom state management.

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

<form
  onsubmit={(e) => {
    e.preventDefault();
    chat.send(input);
    input = "";
  }}
>
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
        <div key={msg.id} className={msg.role}>
          {msg.content}
        </div>
      ))}
      {loading && <span className="cursor">▌</span>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
          setInput("");
        }}
      >
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
  <form
    @submit.prevent="
      send(input);
      input = '';
    "
  >
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
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input());
          setInput("");
        }}
      >
        <input
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
        />
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
  model?: string; // model key passed to your StreamHandler
  system?: string; // system prompt sent with every request
  endpoint?: string; // defaults to /__aibind__/chat
  fetch?: typeof fetch; // custom fetch implementation
  onFinish?: (messages: ChatMessage[]) => void;
  onError?: (error: Error) => void;
  // Tool calling
  toolset?: string; // named toolset registered on the server (defaults to "default")
  maxSteps?: number; // max tool-call → result → LLM rounds per turn (default: 5)
  onToolCall?: (name: string, args: unknown) => void; // fired when a tool is invoked
}
```

### Reactive state

| Property        | Type            | Description                                                              |
| --------------- | --------------- | ------------------------------------------------------------------------ |
| `messages`      | `ChatMessage[]` | Full conversation history. Each message has `id`, `role`, and `content`. |
| `loading`       | `boolean`       | `true` while the assistant is streaming.                                 |
| `error`         | `Error \| null` | Last error, or `null`.                                                   |
| `status`        | `StreamStatus`  | `"idle"` / `"streaming"` / `"done"` / `"error"`                          |
| `hasOptimistic` | `boolean`       | `true` when any message in the array is still optimistic (unconfirmed).  |

### Methods

| Method                    | Description                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `send(text, opts?)`       | Append a user message and stream the assistant reply. No-op if `text` is empty or loading.                                       |
| `abort()`                 | Cancel the in-flight request. The partial assistant message stays in history.                                                    |
| `clear()`                 | Reset to empty conversation.                                                                                                     |
| `regenerate()`            | Remove the last assistant reply (and its user turn) and re-send the same user message (with any original attachments).           |
| `edit(id, text, opts?)`   | Truncate history from message `id` onwards and re-send `text` as a new user turn.                                                |
| `revert()`                | Abort the current request, remove the last user+assistant pair, and return the user's text. Returns `null` if nothing to revert. |
| `optimistic(text, opts?)` | Stage a user+assistant message pair immediately without making a request. Returns a [`StagedMessage`](#stagedmessage) handle.    |

### `ChatMessage` type

```ts
interface ChatMessage {
  id: string; // stable UUID, assigned on creation
  role: "user" | "assistant";
  content: string; // accumulates during streaming
  optimistic?: boolean; // true until the request is confirmed
  attachments?: Attachment[]; // images/files attached to this message
}
```

### `ChatSendOptions` type

```ts
interface ChatSendOptions {
  attachments?: Attachment[];
}
```

### `StagedMessage`

The handle returned by `chat.optimistic(text)`:

```ts
interface StagedMessage {
  send(): void; // start streaming — commits the staged pair
  cancel(): void; // remove the staged pair from messages[]
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

## Tool calling

Chat has first-class support for server-executed tools. Register named toolsets on the server and opt in per chat instance on the client with `toolset`:

```svelte
const chat = new Chat({
  toolset: "search",   // opt in by name — omitting this disables tools entirely
  maxSteps: 5,
  onToolCall(name) { status = `Running ${name}…`; },
});
```

→ [Full tool calling guide](/concepts/tool-calling)

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
      <button
        onclick={() => {
          chat.edit(msg.id, editText);
          editingId = null;
        }}
      >
        Save & Resend
      </button>
    {:else}
      <p>{msg.content}</p>
      {#if msg.role === "user"}
        <button
          onclick={() => {
            editingId = msg.id;
            editText = msg.content;
          }}
        >
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

## Attachments

Send images and files alongside text by passing `attachments` in the second argument to `send()`, `optimistic()`, or `edit()`.

### `Attachment` type

```ts
interface Attachment {
  mimeType: string; // e.g. "image/png", "application/pdf"
  data?: string; // base64-encoded content (no data: prefix)
  url?: string; // OR a remote URL — mutually exclusive with data
}
```

### `fileToAttachment(file)`

The `fileToAttachment` utility converts a browser `File` object to an `Attachment` by reading it as base64. **Browser-only** — uses `FileReader`.

```ts
import { fileToAttachment } from "@aibind/core"; // or your framework package
```

### Full example

::: code-group

```svelte [SvelteKit]
<script lang="ts">
  import { Chat, fileToAttachment } from "@aibind/sveltekit";
  import type { Attachment } from "@aibind/sveltekit";

  const chat = new Chat({ model: "smart" });
  let input = $state("");
  let attachments: Attachment[] = $state([]);

  async function onFileChange(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files) return;
    attachments = await Promise.all([...files].map(fileToAttachment));
  }

  function send() {
    if (!input.trim() && !attachments.length) return;
    chat.send(input, { attachments });
    input = "";
    attachments = [];
  }
</script>

{#each chat.messages as msg (msg.id)}
  <div class={msg.role}>
    {#if msg.attachments?.length}
      {#each msg.attachments as att}
        {#if att.mimeType.startsWith("image/")}
          <img src="data:{att.mimeType};base64,{att.data}" alt="attachment" />
        {/if}
      {/each}
    {/if}
    <p>{msg.content}</p>
  </div>
{/each}

<form
  onsubmit={(e) => {
    e.preventDefault();
    send();
  }}
>
  <input bind:value={input} placeholder="Ask something…" />
  <input type="file" accept="image/*" multiple onchange={onFileChange} />
  <button disabled={chat.loading}>Send</button>
</form>
```

```tsx [Next.js / React]
"use client";
import { useChat } from "@aibind/nextjs";
import { fileToAttachment } from "@aibind/core";
import type { Attachment } from "@aibind/nextjs";
import { useState } from "react";

export default function ChatPage() {
  const { messages, send, loading } = useChat({ model: "smart" });
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    setAttachments(await Promise.all([...files].map(fileToAttachment)));
  }

  function handleSend() {
    send(input, { attachments });
    setInput("");
    setAttachments([]);
  }

  return (
    <>
      {messages.map((msg) => (
        <div key={msg.id} className={msg.role}>
          {msg.attachments?.map((att, i) =>
            att.mimeType.startsWith("image/") ? (
              <img
                key={i}
                src={`data:${att.mimeType};base64,${att.data}`}
                alt="attachment"
              />
            ) : null,
          )}
          <p>{msg.content}</p>
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} />
        <input type="file" accept="image/*" multiple onChange={onFileChange} />
        <button disabled={loading}>Send</button>
      </form>
    </>
  );
}
```

:::

The server receives `attachments` alongside the message and `StreamHandler.chat()` converts them to the AI SDK's multipart format automatically — images become `ImagePart`, other files become `FilePart`.

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
  <form
    onsubmit={(e) => {
      e.preventDefault();
      stage();
    }}
  >
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
    <button
      onclick={() => {
        input = chat.revert() ?? input;
      }}
    >
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
import { Chat, fileToAttachment } from "@aibind/sveltekit";
import type {
  Attachment,
  ChatMessage,
  ChatSendOptions,
  StagedMessage,
} from "@aibind/sveltekit";
// Instantiate in <script> — lifecycle tied to component
const chat = new Chat({ model: "smart" });
```

```ts [Next.js]
import { useChat } from "@aibind/nextjs";
import { fileToAttachment } from "@aibind/core";
import type {
  Attachment,
  ChatMessage,
  ChatSendOptions,
  StagedMessage,
} from "@aibind/nextjs";
```

```ts [React Router v7]
import { useChat } from "@aibind/react-router";
import { fileToAttachment } from "@aibind/core";
import type {
  Attachment,
  ChatSendOptions,
  StagedMessage,
} from "@aibind/react-router";
```

```ts [TanStack Start]
import { useChat } from "@aibind/tanstack-start";
import { fileToAttachment } from "@aibind/core";
import type {
  Attachment,
  ChatSendOptions,
  StagedMessage,
} from "@aibind/tanstack-start";
```

```ts [Nuxt / Vue]
import { useChat } from "@aibind/nuxt";
import { fileToAttachment } from "@aibind/core";
import type {
  Attachment,
  ChatMessage,
  ChatSendOptions,
  StagedMessage,
} from "@aibind/nuxt";
```

```ts [SolidStart / Solid]
import { useChat } from "@aibind/solidstart";
import { fileToAttachment } from "@aibind/core";
import type {
  Attachment,
  ChatMessage,
  ChatSendOptions,
  StagedMessage,
} from "@aibind/solidstart";
```

:::
