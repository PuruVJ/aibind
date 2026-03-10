# @aibind/tanstack-start

## 0.12.0

### Minor Changes

- [#25](https://github.com/PuruVJ/aibind/pull/25) [`439aab2`](https://github.com/PuruVJ/aibind/commit/439aab26fc6283c2de199136023f65c98b51aa7a) Thanks [@PuruVJ](https://github.com/PuruVJ)! - Graph-only `ServerAgent` — `ServerAgent extends AgentGraph` (breaking).

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

### Patch Changes

- Updated dependencies [[`439aab2`](https://github.com/PuruVJ/aibind/commit/439aab26fc6283c2de199136023f65c98b51aa7a), [`439aab2`](https://github.com/PuruVJ/aibind/commit/439aab26fc6283c2de199136023f65c98b51aa7a)]:
  - @aibind/core@0.15.0
  - @aibind/react@0.12.0

## 0.11.3

### Patch Changes

- Updated dependencies [[`e7928ef`](https://github.com/PuruVJ/aibind/commit/e7928ef16332cc52cbb4e610c3ac656f945db8f0)]:
  - @aibind/core@0.14.0
  - @aibind/react@0.11.3

## 0.11.2

### Patch Changes

- Updated dependencies [[`dfa2c92`](https://github.com/PuruVJ/aibind/commit/dfa2c9279040b647b26a74b7ac356095a089b827), [`dfa2c92`](https://github.com/PuruVJ/aibind/commit/dfa2c9279040b647b26a74b7ac356095a089b827), [`dfa2c92`](https://github.com/PuruVJ/aibind/commit/dfa2c9279040b647b26a74b7ac356095a089b827), [`dfa2c92`](https://github.com/PuruVJ/aibind/commit/dfa2c9279040b647b26a74b7ac356095a089b827)]:
  - @aibind/core@0.13.0
  - @aibind/react@0.11.2

## 0.11.1

### Patch Changes

- Updated dependencies [[`f342762`](https://github.com/PuruVJ/aibind/commit/f342762ae6386b5651fc576ea7ea7817885aa1b8)]:
  - @aibind/core@0.12.0
  - @aibind/react@0.11.1

## 0.11.0

### Minor Changes

- [#17](https://github.com/PuruVJ/aibind/pull/17) [`4f1e7d4`](https://github.com/PuruVJ/aibind/commit/4f1e7d4e9800a4c9f4e79b8ec2650e1d8600c229) Thanks [@PuruVJ](https://github.com/PuruVJ)! - **Breaking:** `ServerAgent` no longer accepts a `tools` field. Replace it with `toolsets` (a named registry) and `toolset` (the server-side default).

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

### Patch Changes

- Updated dependencies [[`4f1e7d4`](https://github.com/PuruVJ/aibind/commit/4f1e7d4e9800a4c9f4e79b8ec2650e1d8600c229)]:
  - @aibind/core@0.11.0
  - @aibind/react@0.11.0

## 0.10.0

### Minor Changes

- [#15](https://github.com/PuruVJ/aibind/pull/15) [`7322ed9`](https://github.com/PuruVJ/aibind/commit/7322ed996363cc8c9629871e1a802feefc8ba9a6) Thanks [@PuruVJ](https://github.com/PuruVJ)! - Add toolset-based tool calling to chat: register named tool collections on the server via `createStreamHandler({ toolsets: { ... } })`, select them per chat instance via `useChat({ toolset, maxSteps, onToolCall })`. Upgrades the `/chat` wire protocol from plain text to SSE (same as `/stream`) to support `tool_call` events for real-time UI feedback.

### Patch Changes

- Updated dependencies [[`7322ed9`](https://github.com/PuruVJ/aibind/commit/7322ed996363cc8c9629871e1a802feefc8ba9a6)]:
  - @aibind/core@0.10.0
  - @aibind/react@0.10.0

## 0.9.1

### Patch Changes

- [`30523ec`](https://github.com/PuruVJ/aibind/commit/30523ec40cd818133f1c5ce8cf931c2091395ff4) Thanks [@PuruVJ](https://github.com/PuruVJ)! - Fix cross-package parity: add useChatHistory, useProject, fileToAttachment, and comprehensive type exports to all framework packages; ensure meta-framework wrappers correctly inject endpoint defaults for useChat, useRace, and useCompletion.

- Updated dependencies [[`30523ec`](https://github.com/PuruVJ/aibind/commit/30523ec40cd818133f1c5ce8cf931c2091395ff4)]:
  - @aibind/react@0.9.1

## 0.9.0

### Minor Changes

- [#12](https://github.com/PuruVJ/aibind/pull/12) [`d7b2d54`](https://github.com/PuruVJ/aibind/commit/d7b2d5439410382dc6efbfc5cfb7e40f713dd8c2) Thanks [@PuruVJ](https://github.com/PuruVJ)! - Add multimodal attachment support to chat

  `chat.send()`, `chat.optimistic()`, and `chat.edit()` now accept a second `opts` argument with an optional `attachments` field. Attachments are stored on `ChatMessage.attachments` and replayed automatically by `regenerate()`. A new `fileToAttachment(file: File)` browser utility converts a `File` to base64 `Attachment`. The server-side `StreamHandler` converts attachments to AI SDK `ImagePart`/`FilePart` format automatically.

### Patch Changes

- Updated dependencies [[`d7b2d54`](https://github.com/PuruVJ/aibind/commit/d7b2d5439410382dc6efbfc5cfb7e40f713dd8c2)]:
  - @aibind/core@0.9.0
  - @aibind/react@0.9.0

## 0.6.2

### Patch Changes

- Updated dependencies [[`f9f2274`](https://github.com/PuruVJ/aibind/commit/f9f2274374c40bb9f432ae6546e74a1eb8d9f676)]:
  - @aibind/core@0.8.0
  - @aibind/react@0.8.0

## 0.6.1

### Patch Changes

- [#7](https://github.com/PuruVJ/aibind/pull/7) [`59c2d0d`](https://github.com/PuruVJ/aibind/commit/59c2d0d86f6422e8de1345bc1aa6ec3ece342491) Thanks [@PuruVJ](https://github.com/PuruVJ)! - Add `Chat`/`useChat` — high-level multi-turn conversational hook across all framework packages.
  - **`@aibind/core`**: new `ChatController` class and `StreamHandler.chat()` endpoint (`POST /__aibind__/chat`)
  - **`@aibind/svelte`**: new reactive `Chat` class with `$state` fields, `send`, `abort`, `clear`, `regenerate`, `edit`
  - **`@aibind/sveltekit`**: `Chat` and `Race` with default endpoints (`/__aibind__/chat`, `/__aibind__/stream`); `Chat`, `Race`, `Completion` now exported at top level
  - **`@aibind/react`**: `useChat` hook; `useRace`, `useCompletion` already present
  - **`@aibind/vue`**: `useChat` composable
  - **`@aibind/solid`**: `useChat` hook
  - **`@aibind/nextjs`, `react-router`, `tanstack-start`**: re-export `useChat`, `useRace`, `useCompletion` from `@aibind/react`
  - **`@aibind/nuxt`**: re-export `useChat`, `useRace`, `useCompletion` from `@aibind/vue`
  - **`@aibind/solidstart`**: re-export `useChat`, `useRace`, `useCompletion` from `@aibind/solid`

- Updated dependencies [[`59c2d0d`](https://github.com/PuruVJ/aibind/commit/59c2d0d86f6422e8de1345bc1aa6ec3ece342491)]:
  - @aibind/core@0.7.0
  - @aibind/react@0.7.0

## 0.6.0

### Minor Changes

- [#3](https://github.com/PuruVJ/aibind/pull/3) [`d2093f2`](https://github.com/PuruVJ/aibind/commit/d2093f2a6b73e9679681e45f8cdf2247d5347c4a) Thanks [@PuruVJ](https://github.com/PuruVJ)! - Add cross-tab stream sync via BroadcastChannel. Call `stream.broadcast(channelName)` on the source and use `StreamMirror` (Svelte) or `useStreamMirror(channelName)` (React/Vue/Solid) on any mirror page — live state updates with zero extra HTTP requests.

### Patch Changes

- Updated dependencies [[`d2093f2`](https://github.com/PuruVJ/aibind/commit/d2093f2a6b73e9679681e45f8cdf2247d5347c4a), [`38ee915`](https://github.com/PuruVJ/aibind/commit/38ee915c9fa10ee228eef8637ec39acdb8442de2)]:
  - @aibind/core@0.6.0
  - @aibind/react@0.6.0

## 0.5.0

### Minor Changes

- [#1](https://github.com/PuruVJ/aibind/pull/1) [`9b0200c`](https://github.com/PuruVJ/aibind/commit/9b0200c1cdd91b7e1d1aee6f3f6ebff6064b994d) Thanks [@PuruVJ](https://github.com/PuruVJ)! - Add streaming artifacts support with reactive `artifacts` and `activeArtifact` surfaces on all stream objects. Ships three built-in detectors (`default`, `claude`, `fence`) via new `/artifact` subpath exports across all packages.

### Patch Changes

- Updated dependencies [[`9b0200c`](https://github.com/PuruVJ/aibind/commit/9b0200c1cdd91b7e1d1aee6f3f6ebff6064b994d)]:
  - @aibind/core@0.5.0
  - @aibind/react@0.5.0
