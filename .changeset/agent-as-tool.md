---
"@aibind/core": minor
---

## Multi-agent composition — `ServerAgent.asTool()`

`ServerAgent` gains an `asTool(description)` method that wraps the agent as an AI SDK `Tool`. This enables orchestrator/sub-agent pipelines in pure TypeScript: pass sub-agents into another agent's `toolsets` and the outer model can invoke them like any other tool.

Because the returned tool is a plain AI SDK `Tool` object, it works in **both** `ServerAgent` toolsets and `createStreamHandler` toolsets — define once, share between Chat and Agent contexts.

```ts
const researcher = new ServerAgent({ model, system: "Research topics thoroughly." });
const writer = new ServerAgent({ model, system: "Write compelling content." });

export const toolsets = {
  default: {
    researcher: researcher.asTool("Research a topic and return findings"),
    writer: writer.asTool("Write an article given a brief"),
  },
};

// Chat users with toolset: "default" can trigger sub-agents
export const handle = createStreamHandler({ models, toolsets });

// Orchestrator agent coordinates sub-agents
const orchestrator = new ServerAgent({ model, system: "Coordinate.", toolsets, toolset: "default" });
export const POST = ({ request }) => orchestrator.handle(request);
```

Sub-agents run to completion (`generateText`) before returning their result to the outer loop, so the orchestrator receives the full output as a tool result.
