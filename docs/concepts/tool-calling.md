# Tool Calling

Chat supports server-executed tools via named **toolsets**. Register tool collections on the server, select them explicitly per chat instance on the client. The model decides when to call tools, the server executes them, and the response streams back — all transparently.

::: tip Opt-in only
Tools are strictly opt-in. If no `toolset` is specified on the client, the request is treated as a plain chat with no tools, regardless of what toolsets are registered on the server.
:::

## Quickstart

### 1. Register toolsets on the server

```ts
// SvelteKit: src/hooks.server.ts
import { createStreamHandler } from "@aibind/sveltekit/server";
import { tool } from "ai";
import { z } from "zod";
import { models } from "./models.server";

export const handle = createStreamHandler({
  models,
  toolsets: {
    search: {
      get_weather: tool({
        description: "Get current weather for a city",
        parameters: z.object({ city: z.string() }),
        execute: async ({ city }) => fetchWeather(city),
      }),
      get_time: tool({
        description: "Get the current date and time",
        parameters: z.object({}),
        execute: async () => ({ time: new Date().toLocaleTimeString() }),
      }),
    },
  },
});
```

Each toolset is a flat map of `toolName → AI SDK tool`. The `execute` function runs server-side — the client never sees your implementation.

### 2. Enable tools on the client

Pass the toolset name explicitly via `toolset`. Without it, no tools are activated.

::: code-group

```svelte [SvelteKit]
<script lang="ts">
  import { Chat } from "@aibind/sveltekit";

  let toolStatus = $state("");

  const chat = new Chat({
    model: "smart",
    toolset: "search", // must match a key registered on the server
    maxSteps: 5, // max tool-call → result → LLM rounds per turn
    onToolCall(name) {
      toolStatus = `Calling ${name}…`;
    },
    onFinish() {
      toolStatus = "";
    },
  });

  let input = $state("");
</script>

{#if toolStatus}
  <p class="tool-status">{toolStatus}</p>
{/if}

{#each chat.messages as msg (msg.id)}
  <div class={msg.role}>{msg.content}</div>
{/each}

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
import { useChat } from "@aibind/nextjs";
import { useState } from "react";

export default function ChatPage() {
  const [toolStatus, setToolStatus] = useState("");

  const { messages, send, loading } = useChat({
    model: "smart",
    toolset: "search",
    maxSteps: 5,
    onToolCall(name) {
      setToolStatus(`Calling ${name}…`);
    },
    onFinish() {
      setToolStatus("");
    },
  });

  const [input, setInput] = useState("");

  return (
    <>
      {toolStatus && <p className="tool-status">{toolStatus}</p>}
      {messages.map((msg) => (
        <div key={msg.id} className={msg.role}>
          {msg.content}
        </div>
      ))}
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
import { useChat } from "@aibind/nuxt";
import { ref } from "vue";

const toolStatus = ref("");

const { messages, send, loading } = useChat({
  model: "smart",
  toolset: "search",
  maxSteps: 5,
  onToolCall(name) {
    toolStatus.value = `Calling ${name}…`;
  },
  onFinish() {
    toolStatus.value = "";
  },
});

const input = ref("");
</script>

<template>
  <p v-if="toolStatus" class="tool-status">{{ toolStatus }}</p>
  <div v-for="msg in messages" :key="msg.id" :class="msg.role">
    {{ msg.content }}
  </div>
  <form
    @submit.prevent="
      send(input);
      input = '';
    "
  >
    <input v-model="input" />
    <button :disabled="loading">Send</button>
  </form>
</template>
```

```tsx [SolidStart / Solid]
import { useChat } from "@aibind/solidstart";
import { createSignal } from "solid-js";

export default function ChatPage() {
  const [toolStatus, setToolStatus] = createSignal("");

  const { messages, send, loading } = useChat({
    model: "smart",
    toolset: "search",
    maxSteps: 5,
    onToolCall(name) {
      setToolStatus(`Calling ${name}…`);
    },
    onFinish() {
      setToolStatus("");
    },
  });

  const [input, setInput] = createSignal("");

  return (
    <>
      {toolStatus() && <p class="tool-status">{toolStatus()}</p>}
      <For each={messages()}>
        {(msg) => <div class={msg.role}>{msg.content}</div>}
      </For>
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

## Multiple toolsets

Register several named toolsets on the server and choose the right one per chat instance. Useful for apps with different tool scopes per feature.

```ts
// hooks.server.ts
export const handle = createStreamHandler({
  models,
  toolsets: {
    assistant: {
      get_weather: tool({ ... }),
      get_time: tool({ ... }),
    },
    billing: {
      get_invoice: tool({ ... }),
      issue_refund: tool({ ... }),
    },
    research: {
      vector_search: tool({ ... }),
      web_search: tool({ ... }),
    },
  },
});
```

On the client, select the toolset by name. Chat instances without a `toolset` get no tools.

```ts
// Plain chat — no tools
const chat = new Chat({ model: "smart" });

// Billing assistant
const billingChat = new Chat({ model: "smart", toolset: "billing" });

// Research assistant
const researchChat = new Chat({
  model: "smart",
  toolset: "research",
  maxSteps: 10,
});
```

Passing an unknown toolset key results in no tools being activated.

## API reference

### Server — `StreamHandlerConfig`

```ts
interface StreamHandlerConfig {
  // ...existing options...

  /**
   * Named toolsets available to the /chat endpoint.
   * Each toolset is a flat map of tool name → AI SDK Tool.
   * Toolsets are opt-in — the client must explicitly select one via `toolset` in ChatOptions.
   */
  toolsets?: Record<string, Record<string, import("ai").Tool>>;
}
```

### Client — `ChatOptions` (tool calling fields)

```ts
interface ChatOptions {
  /**
   * Named toolset to activate. Must match a key in `createStreamHandler({ toolsets })`.
   * Omitting this option disables tool calling entirely for this instance.
   */
  toolset?: string;

  /**
   * Maximum tool-call → result → LLM rounds per turn.
   * Prevents runaway loops. Default: 5. Only applies when a toolset is active.
   */
  maxSteps?: number;

  /**
   * Called each time the model invokes a tool before producing the final response.
   * Use to show "Searching…", progress spinners, or tool call logs in the UI.
   */
  onToolCall?: (name: string, args: unknown) => void;
}
```

## How it works

1. The client sends `{ toolset, maxSteps }` alongside the message history in the request body.
2. The server selects the matching toolset and passes those tools to the AI SDK's `streamText`.
3. The model decides which tools to call and in what order.
4. The server executes each tool call and feeds the result back to the model (up to `maxSteps` rounds).
5. For each tool invocation, a `tool_call` SSE event is emitted immediately — `onToolCall` fires on the client in real time so you can show progress.
6. Once the model produces its final text response, it streams back as normal SSE data chunks.

Tools are pure server-side — the client never receives tool implementations, secrets, or raw results. Only the final streamed text response reaches the client (plus the `tool_call` event names for UI feedback).
