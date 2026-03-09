# Agents

Agents are server-side AI processes that can call tools, handle multi-step workflows, and stream responses back to the client.

## Architecture

```
Client (useAgent)  ←→  Server (ServerAgent)
     ↓                       ↓
  messages[]            toolset selection
  status                tool execution
  pendingApproval       streaming response
```

## Server setup

Register toolsets on `ServerAgent` and export `.handle` as the route:

```ts
// src/routes/api/agent/+server.ts (SvelteKit)
import { ServerAgent } from "@aibind/sveltekit/agent";
import { tool, stepCountIs } from "ai";
import { z } from "zod";
import { models } from "../../../models.server";

const agent = new ServerAgent({
  model: models.gpt,
  system: "You are a helpful assistant with access to tools.",
  toolsets: {
    assistant: {
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
  },
  toolset: "assistant", // server-side default
  stopWhen: stepCountIs(5),
});

export const POST = ({ request }: { request: Request }) =>
  agent.handle(request);
```

`agent.handle(request)` reads `{ messages, toolset? }` from the body and returns a streaming text response. For Next.js App Router: `export const POST = agent.handle.bind(agent)`.

## Client usage

::: code-group

```svelte [SvelteKit]
<script lang="ts">
  import { Agent } from "@aibind/sveltekit/agent";

  const agent = new Agent({
    toolset: "assistant", // opts in to the server-registered toolset
  });
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
  const { messages, send, status, stop } = useAgent({
    toolset: "assistant",
  });

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

const { messages, send, status, stop } = useAgent({ toolset: "assistant" });
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
  const { messages, send, status, stop } = useAgent({ toolset: "assistant" });

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

:::

## Multiple toolsets

Register several toolsets and let the client select one per instance:

```ts
// server
const agent = new ServerAgent({
  model: models.gpt,
  system: "You are a helpful assistant.",
  toolsets: {
    assistant: { get_weather: tool(...), get_time: tool(...) },
    billing:   { get_invoice: tool(...), issue_refund: tool(...) },
  },
  // no default — client must opt in
});
```

```ts
// client
const supportAgent = new Agent({ toolset: "assistant" });
const billingAgent = new Agent({ toolset: "billing" });
const noToolsAgent = new Agent(); // no toolset — tools disabled
```

Toolsets are **opt-in**: omitting `toolset` on the client disables tools entirely, regardless of what the server has registered.

## Sharing toolsets with Chat

If both Chat and Agent need the same tools, define them once and share:

```ts
// lib/toolsets.server.ts
export const toolsets = {
  assistant: { get_weather: tool(...) },
};

// hooks.server.ts — Chat path
export const handle = createStreamHandler({ models, toolsets });

// routes/api/agent/+server.ts — Agent path
const agent = new ServerAgent({ system: "...", toolsets, toolset: "assistant" });
export const POST = ({ request }) => agent.handle(request);
```

→ For full tool calling details see [Tool Calling](/concepts/tool-calling)

## Multi-agent composition

`ServerAgent.asTool(description)` wraps an agent as a callable AI SDK tool so it can be invoked by another agent's tool loop — or by Chat. This enables orchestrator/sub-agent pipelines in pure TypeScript.

```ts
// lib/agents.server.ts
const researcher = new ServerAgent({
  model,
  system: "Research topics thoroughly and return detailed findings.",
});

const writer = new ServerAgent({
  model,
  system: "Write clear, compelling content from provided briefs.",
});

export const toolsets = {
  default: {
    researcher: researcher.asTool("Research a topic and return findings"),
    writer: writer.asTool("Write an article given a brief"),
  },
};

// hooks.server.ts — Chat users can also invoke sub-agents
export const handle = createStreamHandler({ models, toolsets });

// routes/api/orchestrator/+server.ts
const orchestrator = new ServerAgent({
  model,
  system: "Coordinate research and writing tasks to produce great content.",
  toolsets,
  toolset: "default",
});
export const POST = ({ request }) => orchestrator.handle(request);
```

Sub-agents run to completion before returning their result to the outer loop — the orchestrator sees the full output as a tool result and uses it to compose its final response.

Because `asTool()` returns a plain AI SDK `Tool`, the same toolset works for both Chat and Agent with no adaptation.

## Agent state

| Property          | Type                             | Description                                             |
| ----------------- | -------------------------------- | ------------------------------------------------------- |
| `messages`        | `AgentMessage[]`                 | Conversation messages                                   |
| `status`          | `AgentStatus`                    | `'idle' \| 'running' \| 'awaiting-approval' \| 'error'` |
| `error`           | `Error \| null`                  | Any error                                               |
| `pendingApproval` | `{ id, toolName, args } \| null` | Tool needing user approval                              |

## Methods

| Method              | Description                 |
| ------------------- | --------------------------- |
| `send(prompt)`      | Send a message to the agent |
| `stop()`            | Abort the current agent run |
| `approve(id)`       | Approve a pending tool call |
| `deny(id, reason?)` | Deny a pending tool call    |

## Tool approval

Tools can require user approval before execution:

```ts
const agent = new ServerAgent({
  toolsets: {
    dangerous: {
      delete_file: tool({
        description: "Delete a file",
        inputSchema: z.object({ path: z.string() }),
        // Tool requires approval — handled by client
      }),
    },
  },
  toolset: "dangerous",
  requireApproval: ["delete_file"],
});
```

The client receives a `pendingApproval` event and must call `approve()` or `deny()` to continue.
