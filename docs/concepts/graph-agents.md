# Graph Agents

Graph agents turn a single AI call into a **directed pipeline of named steps**. Each step is its own mini-agent with its own system prompt, tools, and model. The graph determines which step runs next — either unconditionally or based on what the previous step produced.

Think of it like an assembly line: the user's message enters at `__start__`, flows through each station in order, and the finished answer exits at `__end__`.

## Mental model

```
User message
     │
  __start__
     │
  [research]   ← gathers facts, may call tools
     │
  (conditional) ── has findings? ──yes──▶ [analyze]  ← extracts patterns
     │                                        │
     no                                    [summarize] ← writes the final answer
     │                                        │
  [summarize] ◀───────────────────────────────┘
     │
  __end__
     │
  Response shown to user
```

Every box in the diagram is a **node**. Every arrow is an **edge**. The graph always starts at `__start__` and terminates when any edge points to `__end__`.

---

## Nodes

A node is a named AI step. When the graph reaches a node, it:

1. Builds a prompt from the full conversation history so far
2. Runs `streamText()` with that node's system prompt and tools
3. Appends the output to the shared history (so the next node sees everything)
4. Calls `extractContext` if defined, merging its return value into the routing context
5. Advances to the next node via the node's outgoing edge

```ts
const graph = new AgentGraph()
  .addNode("research", {
    system: "Gather concrete facts. Use tools when available.",
    tools: { get_weather, get_time }, // optional — omit for pure text
    extractContext: ({ text }) => ({
      hasFindings: text.trim().length > 80,
    }),
  })
  .addNode("summarize", {
    system: "Synthesize everything into a direct 2–4 sentence answer.",
  });
```

### Node options

| Option | Type | Description |
|--------|------|-------------|
| `system` | `string` | System prompt for this node. Overrides the top-level `ServerAgent` system. |
| `model` | `LanguageModel` | Model override. Defaults to the `ServerAgent` model. |
| `tools` | `Record<string, Tool>` | Tools available in this node's tool loop. Omit for text-only nodes. |
| `stopWhen` | `StopCondition` | When to stop the tool loop. Defaults to `stepCountIs(5)`. |
| `extractContext` | `({ text }) => Record<string, unknown>` | Extract routing data from the node's output. Merged into the shared context object. |
| `requireApproval` | `boolean` | Pause after this node and wait for the user to approve before continuing. |

---

## Edges

Edges control flow. There are two kinds.

### Static edge — always go here next

```ts
.addEdge("__start__", "research")   // research is the first node
.addEdge("analyze", "summarize")    // after analyze, always go to summarize
.addEdge("summarize", "__end__")    // summarize is the last node
```

`__start__` is the entry point — you must always add an edge from it.
`__end__` is the exit — point any edge to it to terminate the graph.

### Conditional edge — decide at runtime

```ts
.addConditionalEdges("research", (ctx) =>
  ctx.hasFindings ? "analyze" : "summarize"
)
```

The router function receives the **accumulated context** — a plain object that starts empty and gets populated by each node's `extractContext`. This is how earlier nodes communicate routing decisions to later ones without side effects.

A node can only have **one outgoing edge** — either static or conditional, never both.

---

## The context object

Context flows forward through the graph, accumulating values as each node completes:

```
node "research" runs
  └── extractContext({ text }) returns { hasFindings: true }
      └── ctx is now { hasFindings: true }

conditional edge for "research" fires
  └── router(ctx) → "analyze"   (because ctx.hasFindings is true)

node "analyze" runs
  └── extractContext({ text }) returns { sentiment: "positive" }
      └── ctx is now { hasFindings: true, sentiment: "positive" }

static edge "analyze" → "summarize" fires
```

Context is immutable between nodes — each `extractContext` merges new keys in, never modifies existing ones.

---

## Wire protocol

The graph streams NDJSON events over a single HTTP response. You don't need to parse these manually — the client `Agent` handles them — but this is what flows over the wire:

```
{"type":"node-enter","node":"research"}
{"type":"text-delta","text":"Let me look that up..."}
{"type":"tool-call","toolCallId":"t1","toolName":"get_weather","args":{"city":"Tokyo"}}
{"type":"tool-result","toolCallId":"t1","toolName":"get_weather","result":{"temp":22}}
{"type":"text-delta","text":"FINDINGS: Tokyo is 22°C and sunny."}
{"type":"node-exit","node":"research"}
{"type":"node-enter","node":"analyze"}
{"type":"text-delta","text":"1. Temperature is mild..."}
{"type":"node-exit","node":"analyze"}
{"type":"node-enter","node":"summarize"}
{"type":"text-delta","text":"Tokyo is currently 22°C and sunny."}
{"type":"node-exit","node":"summarize"}
{"type":"done"}
```

Each assistant message in `agent.messages` is stamped with the `nodeId` that produced it, so the UI can show which pipeline stage generated each piece of text.

---

## Full example — research pipeline

**Server** (`src/routes/api/agent/graph/+server.ts`):

```ts
import { ServerAgent, AgentGraph } from "@aibind/sveltekit/agent";
import { models } from "../../../../models.server";
import { toolsets } from "../../../../toolsets.server";

const graph = new AgentGraph()
  .addNode("research", {
    system: "Gather specific facts about the user's question. Use tools when relevant. End with 'FINDINGS: <one sentence summary>'.",
    tools: toolsets.assistant,
    extractContext: ({ text }) => ({ hasFindings: text.trim().length > 80 }),
  })
  .addNode("analyze", {
    system: "Extract key patterns and implications from the research. Use numbered points.",
  })
  .addNode("summarize", {
    system: "Write a direct 2–4 sentence answer synthesizing everything above.",
  })
  .addEdge("__start__", "research")
  .addConditionalEdges("research", (ctx) =>
    ctx.hasFindings ? "analyze" : "summarize"
  )
  .addEdge("analyze", "summarize")
  .addEdge("summarize", "__end__");

const agent = new ServerAgent({
  model: models.gpt,
  system: "You are a research pipeline. Follow your current role instructions precisely.",
  graph,
});

export const POST = ({ request }: { request: Request }): Promise<Response> =>
  agent.handle(request);
```

**Client** (SvelteKit):

```svelte
<script lang="ts">
  import { Agent } from "@aibind/sveltekit/agent";

  const agent = new Agent({ endpoint: "/api/agent/graph" });

  // Which nodes have completed — derived purely from message history
  const visitedNodes = $derived(
    new Set(agent.messages.filter((m) => m.nodeId).map((m) => m.nodeId!))
  );
</script>

<!-- Show which node is currently running -->
{#if agent.currentNode}
  <p>Running: {agent.currentNode}</p>
{/if}

<!-- Show messages grouped by node -->
{#each agent.messages as msg}
  {#if msg.role === "assistant"}
    <div class="message" data-node={msg.nodeId}>
      <strong>{msg.nodeId ?? "agent"}:</strong> {msg.content}
    </div>
  {/if}
{/each}

<button onclick={() => agent.send("What's the weather in Tokyo?")}>Ask</button>
```

### `agent.currentNode`

The reactive `currentNode` property reflects the name of the node currently executing, or `null` when idle. Use it to animate a visual graph, show a status badge, or disable UI elements during specific stages.

---

## Routing logic decision tree

When deciding whether to use a static or conditional edge, ask:

- **"Does the next step always run after this one?"** → `addEdge`
- **"Does the next step depend on what this step produced?"** → `addConditionalEdges` + `extractContext`

```
research ──(always)──▶ summarize     →  addEdge("research", "summarize")

research ──(if long)──▶ analyze      →  extractContext + addConditionalEdges
         ──(if short)──▶ summarize
```

---

## Human-in-the-loop (requireApproval)

Add `requireApproval: true` to any node to pause the graph after it completes. The client receives an `approval-request` event and `agent.status` becomes `"awaiting-approval"`. The graph does not advance until the user approves.

```ts
.addNode("review", {
  system: "Review the generated content for quality and accuracy.",
  requireApproval: true,  // pause here for human review
})
.addEdge("review", "publish")
```

```svelte
{#if agent.status === "awaiting-approval" && agent.pendingApproval}
  <div class="approval">
    <p>The agent wants to proceed to: <strong>{agent.pendingApproval.toolName}</strong></p>
    <button onclick={() => agent.approve(agent.pendingApproval!.id)}>Approve</button>
    <button onclick={() => agent.deny(agent.pendingApproval!.id)}>Deny</button>
  </div>
{/if}
```

---

## Why custom routes?

Graph agents always live at their own route file — they can't be auto-registered by `createStreamHandler`. This is by design: the graph definition is bespoke TypeScript code (your routing logic, system prompts, tool configuration) that must live somewhere in your server. The route file is that place.

```
src/routes/
  api/
    agent/
      +server.ts          ← plain tool-calling agent
      graph/
        +server.ts        ← graph agent with custom pipeline
```

The `/__aibind__/` prefix is reserved for `createStreamHandler` auto-endpoints (stream, chat, completion). Your graph agents use any route path you choose.

---

## Comparison: plain agent vs graph agent

| | Plain agent | Graph agent |
|-|-------------|-------------|
| Execution | Single tool loop | Multiple named steps in sequence |
| Prompting | One system prompt | Per-node system prompts |
| Routing | None | Static or conditional edges |
| Observability | Status only | `currentNode` + per-message `nodeId` |
| Use when | Simple Q&A, tool use | Multi-stage reasoning, pipelines |
