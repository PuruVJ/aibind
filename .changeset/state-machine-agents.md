---
"@aibind/core": minor
---

Add LangGraph-style state machine agents via `AgentGraph`.

**New: `AgentGraph`** — define named nodes, static edges, and conditional edges:

```ts
import { AgentGraph, ServerAgent } from "@aibind/core";

const graph = new AgentGraph()
  .addNode("search",    { tools: { web_search }, system: "Search the web." })
  .addNode("summarize", { system: "Summarize the findings." })
  .addNode("review",    { system: "Review for accuracy.", requireApproval: true })
  .addEdge("__start__", "search")
  .addConditionalEdges("search", (ctx) => ctx.hasResults ? "summarize" : "__end__")
  .addEdge("summarize", "review")
  .addEdge("review", "__end__");

const agent = new ServerAgent({ model, system: "Research assistant.", graph });
export const POST = ({ request }) => agent.handle(request);
```

Each node runs its own `streamText()` tool loop (with optional per-node tools, system prompt, model, and `stopWhen`). The graph streams NDJSON events — `node-enter` and `node-exit` bracket each node's output so clients can track graph position in real time.

**`AgentController` gains `currentNode: string | null`** — updated by `node-enter`/`node-exit` events. All framework wrappers (Svelte `Agent`, Vue `useAgent`, React `useAgent`, Solid `useAgent`) expose `currentNode` as a reactive field.

**`AgentStream` additions:**
- `AgentStreamEvent` union extended with `node-enter` and `node-exit` variants
- `AgentStream.createGraphResponse(stream)` — wrap a pre-built ReadableStream as NDJSON response
- `AgentStream.encodeEvent(event)` — encode a single event as a NDJSON line (UTF-8)
- `AgentStream.mapPart(part)` — now public (was private `#mapStreamPart`)

`ServerAgent.handle()` without a `graph` is **100% unchanged**.
