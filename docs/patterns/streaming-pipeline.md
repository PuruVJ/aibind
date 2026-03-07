# Pattern: Streaming Pipeline

Build a multi-stage AI pipeline — research, draft, review — where each stage is visible as it streams. Use `Agent` with tools; the model sequences the stages while the UI shows every intermediate step.

This pattern replaces a hand-wired "chain of streams" with the right primitive: an agent that reasons about sequencing itself.

## How it works

Each pipeline stage is a **tool**. The model calls them in order, streaming its thinking between calls. The client renders tool calls as progress steps and the final text as the result.

## SvelteKit Implementation

### Server

```ts
// src/routes/api/pipeline/+server.ts
import { ServerAgent } from "@aibind/sveltekit/agent";
import { tool, stepCountIs } from "ai";
import { z } from "zod";
import { models } from "../../../models.server";

const pipeline = new ServerAgent({
  model: models.smart,
  system: `You are a structured content pipeline. Given a topic, always follow
these four stages in order by calling the appropriate tool for each:
1. research  — gather key facts and angles
2. outline   — structure the content into sections
3. draft     — write a full draft from the outline
4. review    — critique and improve the draft

After all four tools have been called, write the final polished version as
plain prose. Do not skip stages.`,

  tools: {
    research: tool({
      description: "Gather facts, angles, and source material for the topic.",
      inputSchema: z.object({ topic: z.string() }),
      execute: async ({ topic }) => {
        // Replace with your actual search/retrieval logic
        return {
          facts: [`${topic} was introduced in 2012`, `Widely adopted by 2018`],
          angles: ["history", "practical use", "future outlook"],
        };
      },
    }),

    outline: tool({
      description: "Build a structured outline from research results.",
      inputSchema: z.object({
        research: z.string().describe("Research output as text"),
        sections: z.number().int().min(2).max(6).describe("Number of sections"),
      }),
      execute: async ({ research, sections }) => {
        return { outline: `Intro\n${Array.from({ length: sections - 1 }, (_, i) => `Section ${i + 1}`).join("\n")}\nConclusion`, research };
      },
    }),

    draft: tool({
      description: "Write a full draft from the outline.",
      inputSchema: z.object({
        outline: z.string(),
        wordCount: z.number().int().min(200).max(2000),
      }),
      execute: async ({ outline, wordCount }) => {
        // Replace with a real sub-model call if desired
        return { draft: `[Draft based on outline — ${wordCount} words target]`, wordCount };
      },
    }),

    review: tool({
      description: "Review the draft for clarity, accuracy, and completeness.",
      inputSchema: z.object({ draft: z.string() }),
      execute: async ({ draft }) => {
        return {
          issues: ["Add more concrete examples in Section 2"],
          score: 7,
          draft,
        };
      },
    }),
  },

  stopWhen: stepCountIs(8), // 4 tools + model reasoning steps
});

export async function POST({ request }) {
  const { messages } = await request.json();
  const lastMessage = messages[messages.length - 1];
  return pipeline
    .stream(lastMessage.content, { messages: messages.slice(0, -1) })
    .toTextStreamResponse();
}
```

### Client

```svelte
<script lang="ts">
  import { Agent } from "@aibind/sveltekit/agent";

  const STAGE_LABELS: Record<string, string> = {
    research: "Researching",
    outline: "Building outline",
    draft: "Writing draft",
    review: "Reviewing",
  };

  const agent = new Agent({ endpoint: "/api/pipeline" });
  let topic = $state("");
</script>

<form
  onsubmit={(e) => {
    e.preventDefault();
    agent.send(topic);
    topic = "";
  }}
>
  <input bind:value={topic} placeholder="Enter a topic…" />
  <button disabled={agent.status !== "idle"}>Run pipeline</button>
</form>

<!-- Pipeline stages — tool calls become visible progress steps -->
<div class="pipeline">
  {#each agent.messages as msg}
    {#if msg.type === "tool_call"}
      <div class="stage {msg.status}">
        <span class="label">{STAGE_LABELS[msg.toolName] ?? msg.toolName}</span>
        {#if msg.status === "running"}
          <span class="spinner" />
        {:else if msg.status === "done"}
          <span class="check">done</span>
        {/if}
      </div>
    {:else if msg.role === "assistant" && msg.content}
      <!-- Final output streams here after all stages complete -->
      <div class="result">
        <p>{msg.content}</p>
      </div>
    {/if}
  {/each}

  {#if agent.status === "running"}
    <p class="status">Thinking…</p>
  {/if}

  {#if agent.error}
    <p class="error">{agent.error.message}</p>
  {/if}
</div>
```

## Why not chain streams manually?

You could write:

```ts
const stream1 = new Stream({ model: "smart" });
stream1.send("Research TypeScript");
// wait for done, then:
const stream2 = new Stream({ model: "smart" });
stream2.send(`Outline this: ${stream1.text}`);
// ...
```

But this is a worse version of what Agent already does:

| Manual chaining | Agent |
|-----------------|-------|
| You hardcode the order | Model adapts if a step fails or needs revision |
| No streaming between steps | Model streams reasoning between tool calls |
| Error handling at every hand-off | Agent retries naturally |
| Step count hardcoded | `stopWhen` bounds it safely |

Use manual chaining only when the steps are **fixed transforms** with no model reasoning between them (e.g., extracting structured data then formatting it). For anything that requires judgment between steps, Agent is the right primitive.

## Variations

### Show tool arguments

```svelte
{#if msg.type === "tool_call"}
  <details>
    <summary>{STAGE_LABELS[msg.toolName] ?? msg.toolName}</summary>
    <pre>{JSON.stringify(msg.args, null, 2)}</pre>
  </details>
{/if}
```

### Use a cheaper model for fast stages

```ts
draft: tool({
  description: "Write a quick first draft.",
  inputSchema: z.object({ outline: z.string() }),
  execute: async ({ outline }) => {
    // Spin up a cheap/fast model for the draft step
    const { text } = await generateText({
      model: models.fast,
      prompt: `Write a draft from this outline:\n${outline}`,
    });
    return { draft: text };
  },
}),
```

### Human approval before a slow stage

```svelte
{#if agent.pendingApproval?.toolName === "draft"}
  <div class="approval">
    <p>Ready to write the draft. Outline looks good?</p>
    <button onclick={() => agent.approve(agent.pendingApproval.id)}>Yes, draft it</button>
    <button onclick={() => agent.deny(agent.pendingApproval.id, "Revise outline first")}>Not yet</button>
  </div>
{/if}
```
