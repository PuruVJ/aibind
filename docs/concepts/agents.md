# Agents

Agents are server-side AI processes that execute a named-node state machine. Each node runs its own tool loop, and edges control which node runs next — statically or via a router function.

> **Note:** `ServerAgent` is for graph-based multi-step pipelines. If you need a simple linear tool-calling loop (one LLM call with tools, no branching), use [Chat with toolsets](/concepts/tool-calling) or the AI SDK's `streamText` with tools directly — no agent needed.

## Architecture

```
Client (useAgent)  ←→  Server (ServerAgent)
     ↓                       ↓
  messages[]            node execution
  currentNode           tool calls per node
  status                conditional routing
  pendingApproval       streaming NDJSON events
```

## Server setup

Chain `addNode / addEdge / addConditionalEdges` directly on `ServerAgent`, then export `handle` as the route:

```ts
// src/routes/api/agent/+server.ts (SvelteKit)
import { ServerAgent } from "@aibind/sveltekit/agent";
import { tool } from "ai";
import { z } from "zod";
import { models } from "../../../models.server";

const agent = new ServerAgent({
  model: models.gpt,
  system: "You are a research assistant.",
})
  .addNode("search", {
    tools: {
      web_search: tool({
        description: "Search the web",
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => ({ results: [`Result for: ${query}`] }),
      }),
    },
    system: "Search the web for relevant information.",
  })
  .addNode("summarize", {
    system: "Summarize the search results concisely.",
  })
  .addEdge("__start__", "search")
  .addEdge("search", "summarize")
  .addEdge("summarize", "__end__");

export const POST = ({ request }: { request: Request }) =>
  agent.handle(request);
```

`agent.handle(request)` reads `{ messages }` from the body and returns a streaming NDJSON response. For Next.js App Router: `export const POST = agent.handle.bind(agent)`.

## Client usage

::: code-group

```svelte [SvelteKit]
<script lang="ts">
  import { Agent } from "@aibind/sveltekit/agent";

  const agent = new Agent();
</script>

<button onclick={() => agent.send("Research quantum computing")}>Ask</button>

{#each agent.messages as msg}
  <div>
    <strong>{msg.role}{msg.nodeId ? ` [${msg.nodeId}]` : ""}:</strong>
    {msg.content}
  </div>
{/each}

{#if agent.currentNode}
  <p>Running: {agent.currentNode}</p>
{/if}

{#if agent.status === "running"}
  <button onclick={() => agent.stop()}>Stop</button>
{/if}
```

```tsx [Next.js]
"use client";

import { useAgent } from "@aibind/nextjs/agent";

function AgentChat() {
  const { messages, send, status, stop, currentNode } = useAgent();

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i}>
          <strong>
            {msg.role}
            {msg.nodeId ? ` [${msg.nodeId}]` : ""}:
          </strong>{" "}
          {msg.content}
        </div>
      ))}
      {currentNode && <p>Running: {currentNode}</p>}
      <button onClick={() => send("Research quantum computing")}>Ask</button>
      {status === "running" && <button onClick={stop}>Stop</button>}
    </div>
  );
}
```

```vue [Nuxt]
<script setup lang="ts">
import { useAgent } from "@aibind/nuxt/agent";

const { messages, send, status, stop, currentNode } = useAgent();
</script>

<template>
  <div v-for="(msg, i) in messages" :key="i">
    <strong>{{ msg.role }}{{ msg.nodeId ? ` [${msg.nodeId}]` : "" }}:</strong>
    {{ msg.content }}
  </div>
  <p v-if="currentNode">Running: {{ currentNode }}</p>
  <button @click="send('Research quantum computing')">Ask</button>
  <button v-if="status === 'running'" @click="stop()">Stop</button>
</template>
```

```tsx [SolidStart]
import { useAgent } from "@aibind/solidstart/agent";

function AgentChat() {
  const { messages, send, status, stop, currentNode } = useAgent();

  return (
    <div>
      <For each={messages()}>
        {(msg) => (
          <div>
            <strong>
              {msg.role}
              {msg.nodeId ? ` [${msg.nodeId}]` : ""}:
            </strong>{" "}
            {msg.content}
          </div>
        )}
      </For>
      <Show when={currentNode()}>
        <p>Running: {currentNode()}</p>
      </Show>
      <button onClick={() => send("Research quantum computing")}>Ask</button>
      <Show when={status() === "running"}>
        <button onClick={stop}>Stop</button>
      </Show>
    </div>
  );
}
```

:::

## Conditional routing

Use `addConditionalEdges` and `extractContext` to branch between nodes based on output:

```ts
const agent = new ServerAgent({ model, system: "Research assistant." })
  .addNode("search", {
    tools: { web_search },
    system: "Search for information. If you find results, say FOUND.",
    extractContext: ({ text }) => ({ hasResults: text.includes("FOUND") }),
  })
  .addNode("summarize", { system: "Summarize the findings." })
  .addNode("fallback", { system: "Explain that no results were found." })
  .addEdge("__start__", "search")
  .addConditionalEdges("search", (ctx) =>
    ctx.hasResults ? "summarize" : "fallback",
  )
  .addEdge("summarize", "__end__")
  .addEdge("fallback", "__end__");
```

`extractContext` receives the node's full text output and returns a `Record<string, unknown>` merged into the graph context object that router functions receive.

## Per-node model override

Each node can use a different model:

```ts
const agent = new ServerAgent({
  model: models.default,
  system: "Research assistant.",
})
  .addNode("search", {
    model: models.fast, // cheap model for retrieval
    tools: { web_search },
    system: "Search the web.",
  })
  .addNode("summarize", {
    model: models.powerful, // smart model for synthesis
    system: "Synthesize the findings into a detailed report.",
  })
  .addEdge("__start__", "search")
  .addEdge("search", "summarize")
  .addEdge("summarize", "__end__");
```

Nodes without a `model` field inherit the `ServerAgent` model.

## Sharing a graph across agents

Define a reusable graph with `new AgentGraph()` and import it into any agent via `.use(graph)`:

```ts
import { AgentGraph } from "@aibind/core";

// lib/graphs.server.ts
export const researchGraph = new AgentGraph()
  .addNode("research", {
    tools: { web_search },
    system: "Research thoroughly.",
  })
  .addEdge("__start__", "research")
  .addEdge("research", "__end__");

// Fast agent and deep agent — same graph, different models
const fastResearcher = new ServerAgent({
  model: models.fast,
  system: "Quick research.",
}).use(researchGraph);
const deepResearcher = new ServerAgent({
  model: models.deep,
  system: "Deep research.",
}).use(researchGraph);
```

`.use(graph)` copies all nodes and edges into the agent. You can continue chaining `addNode / addEdge` after `.use()` to extend the imported graph.

## Multi-agent composition

`ServerAgent.asTool(description)` wraps an agent as a callable AI SDK tool so it can be invoked by another agent's tool loop — or by Chat via `createStreamHandler`. This enables orchestrator/sub-agent pipelines in pure TypeScript.

```ts
// lib/agents.server.ts
const researcher = new ServerAgent({
  model,
  system: "Research topics and return detailed findings.",
})
  .addNode("research", {
    tools: { web_search },
    system: "Research thoroughly.",
  })
  .addEdge("__start__", "research")
  .addEdge("research", "__end__");

export const toolsets = {
  default: {
    researcher: researcher.asTool("Research a topic and return findings"),
  },
};

// hooks.server.ts — Chat users can also invoke sub-agents as tools
export const handle = createStreamHandler({ models, toolsets });
```

Sub-agents run to completion before returning their result to the outer loop as a tool result.

## Agent state

| Property          | Type                             | Description                                             |
| ----------------- | -------------------------------- | ------------------------------------------------------- |
| `messages`        | `AgentMessage[]`                 | Conversation messages (includes tool calls per node)    |
| `currentNode`     | `string \| null`                 | Active graph node name, or `null` when idle             |
| `status`          | `AgentStatus`                    | `'idle' \| 'running' \| 'awaiting-approval' \| 'error'` |
| `error`           | `Error \| null`                  | Any error                                               |
| `pendingApproval` | `{ id, toolName, args } \| null` | Node needing human approval                             |

## Methods

| Method              | Description                 |
| ------------------- | --------------------------- |
| `send(prompt)`      | Send a message to the agent |
| `stop()`            | Abort the current agent run |
| `approve(id)`       | Approve a pending node      |
| `deny(id, reason?)` | Deny a pending node         |

## Tool approval

Add `requireApproval: true` to any node — the graph pauses after that node completes and emits a `pendingApproval` event on the client. Call `approve()` or `deny()` to continue or abort.

```ts
const agent = new ServerAgent({ model, system: "File editor." })
  .addNode("plan", { system: "Plan the file changes needed." })
  .addNode("execute", {
    tools: { write_file, delete_file },
    system: "Execute the planned changes.",
    requireApproval: true, // pause after planning, before execution
  })
  .addEdge("__start__", "plan")
  .addEdge("plan", "execute")
  .addEdge("execute", "__end__");
```

```svelte
{#if agent.pendingApproval}
  <p>Approve executing: {agent.pendingApproval.toolName}?</p>
  <button onclick={() => agent.approve(agent.pendingApproval.id)}
    >Approve</button
  >
  <button onclick={() => agent.deny(agent.pendingApproval.id)}>Deny</button>
{/if}
```

## Wire protocol

The NDJSON stream the client receives:

```
{"type":"node-enter","node":"search"}
{"type":"tool-call","toolCallId":"abc","toolName":"web_search","args":{...}}
{"type":"tool-result","toolCallId":"abc","toolName":"web_search","result":{...}}
{"type":"text-delta","text":"I found the following..."}
{"type":"node-exit","node":"search"}
{"type":"node-enter","node":"summarize"}
{"type":"text-delta","text":"Here is a summary..."}
{"type":"node-exit","node":"summarize"}
{"type":"done"}
```

## Reusable graphs

For the full `AgentGraph` standalone API (useful for sharing graph definitions across agents), import `AgentGraph` from `@aibind/core`.
