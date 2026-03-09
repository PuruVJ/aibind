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
"@aibind/react-router": minor
"@aibind/tanstack-start": minor
---

**Breaking:** `ServerAgent` no longer accepts a `tools` field. Replace it with `toolsets` (a named registry) and `toolset` (the server-side default).

```ts
// Before
const agent = new ServerAgent({ tools: { get_weather: tool(...) } });

// After
const agent = new ServerAgent({
  toolsets: { assistant: { get_weather: tool(...) } },
  toolset: "assistant",
});
```

**New:** `AgentOptions` accepts a `toolset` field so the client can select (or override) which toolset to activate per instance. Toolsets are **opt-in** — omitting `toolset` on the client disables tools entirely, regardless of what is registered on the server.

**New:** `ServerAgent.handle(request)` method — a Web-compatible `(req: Request) => Promise<Response>` handler for use as a direct route export:

```ts
// SvelteKit
export const POST = ({ request }) => agent.handle(request);

// Next.js App Router
export const POST = agent.handle.bind(agent);
```

**New:** Toolset definitions can be shared between `createStreamHandler` (Chat) and `ServerAgent` (Agent) by extracting them to a shared module — eliminating duplication when both Chat and Agent need the same tools.
