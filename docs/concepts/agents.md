# Agents

Agents are server-side AI processes that can call tools, handle multi-step workflows, and stream responses back to the client.

## Architecture

```
Client (useAgent)  ←→  Server (ServerAgent)
     ↓                       ↓
  messages[]            tool calls
  status                approval flow
  pendingApproval       streaming response
```

## Server Setup

```ts
// src/routes/api/agent/+server.ts (SvelteKit)
import { ServerAgent } from "@aibind/sveltekit/server";
import { tool, stepCountIs } from "ai";
import { z } from "zod";
import { models } from "../../../models.server";

const agent = new ServerAgent({
  model: models.gpt,
  system: "You are a helpful assistant with access to tools.",
  tools: {
    get_weather: tool({
      description: "Get current weather for a city",
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => ({
        city,
        temperature: Math.round(15 + Math.random() * 20),
        condition: "sunny",
      }),
    }),
  },
  stopWhen: stepCountIs(5),
});

export async function POST({ request }) {
  const { messages } = await request.json();
  const lastMessage = messages[messages.length - 1];
  const result = agent.stream(lastMessage.content, {
    messages: messages.slice(0, -1),
  });
  return result.toTextStreamResponse();
}
```

## Client Usage

::: code-group

```svelte [SvelteKit]
<script lang="ts">
  import { Agent } from "@aibind/sveltekit/agent";

  const agent = new Agent({ endpoint: "/api/agent" });
</script>

<button onclick={() => agent.send("What is the weather in Tokyo?")}>Ask</button>

{#each agent.messages as msg}
  <div><strong>{msg.role}:</strong> {msg.content}</div>
{/each}

{#if agent.status === "running"}
  <button onclick={() => agent.stop()}>Stop</button>
{/if}
```

```tsx [Next.js]
"use client";

import { useAgent } from "@aibind/nextjs/agent";

function AgentChat() {
  const { messages, send, status, stop } = useAgent({ endpoint: "/api/agent" });

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i}>
          <strong>{msg.role}:</strong> {msg.content}
        </div>
      ))}
      <button onClick={() => send("What is the weather?")}>Ask</button>
      {status === "running" && <button onClick={stop}>Stop</button>}
    </div>
  );
}
```

```vue [Nuxt]
<script setup lang="ts">
import { useAgent } from "@aibind/nuxt/agent";

const { messages, send, status, stop } = useAgent({ endpoint: "/api/agent" });
</script>

<template>
  <div v-for="(msg, i) in messages" :key="i">
    <strong>{{ msg.role }}:</strong> {{ msg.content }}
  </div>
  <button @click="send('What is the weather?')">Ask</button>
  <button v-if="status === 'running'" @click="stop()">Stop</button>
</template>
```

```tsx [SolidStart]
import { useAgent } from "@aibind/solidstart/agent";

function AgentChat() {
  const { messages, send, status, stop } = useAgent({ endpoint: "/api/agent" });

  return (
    <div>
      <For each={messages()}>
        {(msg) => (
          <div>
            <strong>{msg.role}:</strong> {msg.content}
          </div>
        )}
      </For>
      <button onClick={() => send("What is the weather?")}>Ask</button>
      <Show when={status() === "running"}>
        <button onClick={stop}>Stop</button>
      </Show>
    </div>
  );
}
```

```tsx [TanStack Start]
import { useAgent } from "@aibind/tanstack-start/agent";

function AgentChat() {
  const { messages, send, status, stop } = useAgent({ endpoint: "/api/agent" });

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i}>
          <strong>{msg.role}:</strong> {msg.content}
        </div>
      ))}
      <button onClick={() => send("What is the weather?")}>Ask</button>
      {status === "running" && <button onClick={stop}>Stop</button>}
    </div>
  );
}
```

:::

## Agent State

| Property          | Type                             | Description                                         |
| ----------------- | -------------------------------- | --------------------------------------------------- |
| `messages`        | `AgentMessage[]`                 | Conversation messages                               |
| `status`          | `AgentStatus`                    | `'idle' \| 'running' \| 'awaiting-approval' \| 'error'` |
| `error`           | `Error \| null`                  | Any error                                           |
| `pendingApproval` | `{ id, toolName, args } \| null` | Tool needing user approval                          |

## Methods

| Method              | Description                 |
| ------------------- | --------------------------- |
| `send(prompt)`      | Send a message to the agent |
| `stop()`            | Abort the current agent run |
| `approve(id)`       | Approve a pending tool call |
| `deny(id, reason?)` | Deny a pending tool call    |

## Tool Approval

You can configure tools that require user approval before execution:

```ts
const agent = new ServerAgent({
  tools: {
    delete_file: tool({
      description: "Delete a file",
      inputSchema: z.object({ path: z.string() }),
      // Tool requires approval — handled by client
    }),
  },
  requireApproval: ["delete_file"],
});
```

The client receives a `pendingApproval` event and must call `approve()` or `deny()` to continue.
