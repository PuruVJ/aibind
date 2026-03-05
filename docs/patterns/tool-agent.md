# Pattern: Tool-calling Agent

Build an AI agent that can call server-side tools, handle multi-step reasoning, and stream results back to the client.

## SvelteKit Implementation

### Server

```ts
// src/routes/api/agent/+server.ts
import { ServerAgent } from "@aibind/sveltekit/agent";
import { tool, stepCountIs } from "ai";
import { z } from "zod";
import { models } from "../../../models.server";

const agent = new ServerAgent({
  model: models.smart,
  system: "You are a helpful assistant. Use tools when relevant.",
  tools: {
    search_docs: tool({
      description: "Search the documentation for a topic",
      inputSchema: z.object({
        query: z.string().describe("Search query"),
      }),
      execute: async ({ query }) => {
        // Your search logic here
        return { results: [`Result for: ${query}`] };
      },
    }),
    create_ticket: tool({
      description: "Create a support ticket",
      inputSchema: z.object({
        title: z.string(),
        priority: z.enum(["low", "medium", "high"]),
        description: z.string(),
      }),
      execute: async ({ title, priority, description }) => {
        // Your ticket creation logic
        return { ticketId: "TICK-" + Math.random().toString(36).slice(2, 8) };
      },
    }),
  },
  stopWhen: stepCountIs(10), // Safety limit
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

### Client

```svelte
<script lang="ts">
  import { useAgent } from '@aibind/sveltekit/agent';

  const agent = useAgent({ endpoint: '/api/agent' });
  let prompt = $state('');
</script>

<div class="chat">
  {#each agent.messages as msg}
    <div class="message {msg.role}">
      <strong>{msg.role}:</strong>
      {#if msg.toolCalls}
        {#each msg.toolCalls as call}
          <div class="tool-call">
            Called <code>{call.toolName}</code> with {JSON.stringify(call.args)}
          </div>
        {/each}
      {:else}
        <p>{msg.content}</p>
      {/if}
    </div>
  {/each}

  {#if agent.status === 'thinking'}
    <p class="thinking">Thinking...</p>
  {/if}

  {#if agent.status === 'tool_calling'}
    <p class="thinking">Calling tool...</p>
  {/if}
</div>

<form onsubmit={(e) => { e.preventDefault(); agent.send(prompt); prompt = ''; }}>
  <input bind:value={prompt} placeholder="Ask the agent..." />
  <button disabled={agent.status !== 'idle'}>Send</button>
</form>
```

## Key Patterns

### Tool Design

- Keep tool descriptions clear and specific
- Use Zod `.describe()` on parameters to help the AI understand what to pass
- Return structured data from tools — the AI will interpret it for the user

### Step Limits

Always set `stopWhen: stepCountIs(n)` to prevent infinite tool-calling loops:

```ts
import { stepCountIs } from "ai";

const agent = new ServerAgent({
  // ...
  stopWhen: stepCountIs(5), // Max 5 tool calls per request
});
```

### Tool Approval

For sensitive tools, you can require user approval:

```svelte
{#if agent.pendingApproval}
  <div class="approval">
    <p>Agent wants to call <code>{agent.pendingApproval.toolName}</code></p>
    <p>Args: {JSON.stringify(agent.pendingApproval.args)}</p>
    <button onclick={() => agent.approve(agent.pendingApproval.id)}>Approve</button>
    <button onclick={() => agent.deny(agent.pendingApproval.id, 'Not now')}>Deny</button>
  </div>
{/if}
```
