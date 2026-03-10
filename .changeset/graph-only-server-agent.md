---
"@aibind/core": minor
"@aibind/svelte": minor
"@aibind/sveltekit": minor
"@aibind/react": minor
"@aibind/nextjs": minor
"@aibind/vue": minor
"@aibind/nuxt": minor
"@aibind/solid": minor
"@aibind/solidstart": minor
"@aibind/tanstack-start": minor
"@aibind/react-router": minor
---

Graph-only `ServerAgent` — `ServerAgent extends AgentGraph` (breaking).

`ServerAgent` is now exclusively a graph-based multi-step agent pipeline. For simple linear tool-calling loops, use `Chat` with toolsets or the AI SDK's `streamText` directly.

**Breaking changes:**

- `ServerAgent` now extends `AgentGraph` — `addNode`, `addEdge`, `addConditionalEdges`, `nextNode`, `validate`, and `use` are inherited directly (no duplication).
- `AgentConfig` is now `{ model, system }` only — the `graph`, `toolsets`, `toolset`, and `stopWhen` fields have been removed.
- `AgentOptions` (client-side) no longer has a `toolset` field — toolsets belong to `Chat`, not `Agent`.
- The `graph?` field previously passed to `AgentConfig` is gone; configure nodes and edges directly on the `ServerAgent` instance or use `.use(graph)` with a reusable `AgentGraph`.

**New APIs:**

- `AgentGraph` — standalone reusable graph definition. Define once, share across multiple `ServerAgent` instances via `.use(graph)`.
- `AgentGraph.use(graph)` — import all nodes and edges from another `AgentGraph`.
- `AgentGraph.validate()` — validate graph structure (entry point defined, all edge targets registered).
- `agent.currentNode` (client) — reactive field tracking the currently executing graph node.

**Migration:**

```ts
// Before
const agent = new ServerAgent({
  model,
  system: "...",
  graph: new AgentGraph()
    .addNode("search", { tools: { web_search }, system: "Search." })
    .addEdge("__start__", "search")
    .addEdge("search", "__end__"),
});

// After
const agent = new ServerAgent({ model, system: "..." })
  .addNode("search", { tools: { web_search }, system: "Search." })
  .addEdge("__start__", "search")
  .addEdge("search", "__end__");
```
