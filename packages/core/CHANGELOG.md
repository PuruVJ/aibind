# @aibind/core

## 0.13.0

### Minor Changes

- [#21](https://github.com/PuruVJ/aibind/pull/21) [`dfa2c92`](https://github.com/PuruVJ/aibind/commit/dfa2c9279040b647b26a74b7ac356095a089b827) Thanks [@PuruVJ](https://github.com/PuruVJ)! - ## Multi-agent composition — `ServerAgent.asTool()`

  `ServerAgent` gains an `asTool(description)` method that wraps the agent as an AI SDK `Tool`. This enables orchestrator/sub-agent pipelines in pure TypeScript: pass sub-agents into another agent's `toolsets` and the outer model can invoke them like any other tool.

  Because the returned tool is a plain AI SDK `Tool` object, it works in **both** `ServerAgent` toolsets and `createStreamHandler` toolsets — define once, share between Chat and Agent contexts.

  ```ts
  const researcher = new ServerAgent({
    model,
    system: "Research topics thoroughly.",
  });
  const writer = new ServerAgent({
    model,
    system: "Write compelling content.",
  });

  export const toolsets = {
    default: {
      researcher: researcher.asTool("Research a topic and return findings"),
      writer: writer.asTool("Write an article given a brief"),
    },
  };

  // Chat users with toolset: "default" can trigger sub-agents
  export const handle = createStreamHandler({ models, toolsets });

  // Orchestrator agent coordinates sub-agents
  const orchestrator = new ServerAgent({
    model,
    system: "Coordinate.",
    toolsets,
    toolset: "default",
  });
  export const POST = ({ request }) => orchestrator.handle(request);
  ```

  Sub-agents run to completion (`generateText`) before returning their result to the outer loop, so the orchestrator receives the full output as a tool result.

- [#21](https://github.com/PuruVJ/aibind/pull/21) [`dfa2c92`](https://github.com/PuruVJ/aibind/commit/dfa2c9279040b647b26a74b7ac356095a089b827) Thanks [@PuruVJ](https://github.com/PuruVJ)! - ## Tool call history in Chat messages

  `ChatMessage.role` now includes `"tool"`. When the model invokes a tool during a chat turn, a `{ role: "tool", toolName, toolArgs }` message is inserted into `chat.messages[]` before the assistant's final response. UIs can render these as collapsible "Searched the web…" or "Called get_weather…" indicators.

  Tool messages are automatically filtered from the payload sent to the server — they are UI-only and never included in the conversation history sent to the model.

- [#21](https://github.com/PuruVJ/aibind/pull/21) [`dfa2c92`](https://github.com/PuruVJ/aibind/commit/dfa2c9279040b647b26a74b7ac356095a089b827) Thanks [@PuruVJ](https://github.com/PuruVJ)! - ## `stream.speak()` — streaming Web Speech API

  `StreamController` gains a `speak()` method that pipes the streaming response into the browser's `SpeechSynthesis` API sentence by sentence. Audio playback starts after the first complete sentence — no waiting for the full response. Returns a cleanup function to cancel speech.

  ```ts
  const stream = new Stream({ endpoint: "..." });
  const stopSpeaking = stream.speak();

  stream.send("Explain quantum entanglement");
  // Audio begins playing as sentences complete

  stopSpeaking(); // cancel at any time
  ```

  No-op in non-browser environments (SSR, Node). Zero dependencies — uses `window.speechSynthesis`.

- [#21](https://github.com/PuruVJ/aibind/pull/21) [`dfa2c92`](https://github.com/PuruVJ/aibind/commit/dfa2c9279040b647b26a74b7ac356095a089b827) Thanks [@PuruVJ](https://github.com/PuruVJ)! - ## Tab-switch auto-resume

  `BaseStreamControllerOptions` gains an `autoResume` option. When `true`, the stream automatically suspends when the browser tab becomes hidden and resumes when the tab regains focus — powered by the existing durable stream infrastructure.

  ```ts
  const stream = new Stream({ endpoint: "...", autoResume: true });
  ```

  `BaseStreamController` also gains a `destroy()` method to remove the `visibilitychange` listener when the controller is no longer needed.

  Requires `resumable: true` in `createStreamHandler` on the server.

## 0.12.0

### Minor Changes

- [#19](https://github.com/PuruVJ/aibind/pull/19) [`f342762`](https://github.com/PuruVJ/aibind/commit/f342762ae6386b5651fc576ea7ea7817885aa1b8) Thanks [@PuruVJ](https://github.com/PuruVJ)! - ## Structured streaming now uses AI SDK's native `partialOutputStream`

  The `/structured` endpoint and `StructuredStreamController` have been refactored to use AI SDK v6's `streamText` with `output: Output.object(schema)` instead of hand-rolled partial JSON parsing.

  ### Breaking changes

  **`parsePartialJSON` removed**

  `parsePartialJSON` is no longer exported from `@aibind/core`. It was an internal utility used to parse incomplete JSON token streams client-side — this is now handled server-side by AI SDK.

  **`StructuredStreamController` no longer extends `StreamController`**

  `StructuredStreamController` now extends `BaseStreamController` directly. It does not accumulate raw text and does not expose a `text` getter, `onDiff`, or `onArtifacts` callbacks.

  **`/structured` SSE wire format changed**

  The server now emits typed named events instead of plain text chunks:

  ```
  event: partial
  data: {"sentiment":"positive","score":...}

  event: data
  data: {"sentiment":"positive","score":0.9,"topics":["quality"]}

  event: usage
  data: {"inputTokens":42,"outputTokens":18}

  event: done
  ```

  Any custom client consuming the raw SSE stream from `/structured` must be updated to handle these named events.

  ### New features

  **`BaseStreamController` exported**

  `BaseStreamController`, `BaseStreamCallbacks`, and `BaseStreamControllerOptions` are now exported from `@aibind/core`. Power users can extend the transport base class to build custom stream controllers without inheriting text/diff/artifact logic.

  **More reliable partial objects**

  Partial objects are now produced server-side by AI SDK's `partialOutputStream` — a typed `AsyncIterable` that emits structurally valid partial objects as they build up. This replaces the previous approach of parsing raw JSON token substrings on the client.

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

## 0.10.0

### Minor Changes

- [#15](https://github.com/PuruVJ/aibind/pull/15) [`7322ed9`](https://github.com/PuruVJ/aibind/commit/7322ed996363cc8c9629871e1a802feefc8ba9a6) Thanks [@PuruVJ](https://github.com/PuruVJ)! - Add toolset-based tool calling to chat: register named tool collections on the server via `createStreamHandler({ toolsets: { ... } })`, select them per chat instance via `useChat({ toolset, maxSteps, onToolCall })`. Upgrades the `/chat` wire protocol from plain text to SSE (same as `/stream`) to support `tool_call` events for real-time UI feedback.

## 0.9.0

### Minor Changes

- [#12](https://github.com/PuruVJ/aibind/pull/12) [`d7b2d54`](https://github.com/PuruVJ/aibind/commit/d7b2d5439410382dc6efbfc5cfb7e40f713dd8c2) Thanks [@PuruVJ](https://github.com/PuruVJ)! - Add multimodal attachment support to chat

  `chat.send()`, `chat.optimistic()`, and `chat.edit()` now accept a second `opts` argument with an optional `attachments` field. Attachments are stored on `ChatMessage.attachments` and replayed automatically by `regenerate()`. A new `fileToAttachment(file: File)` browser utility converts a `File` to base64 `Attachment`. The server-side `StreamHandler` converts attachments to AI SDK `ImagePart`/`FilePart` format automatically.

## 0.8.0

### Minor Changes

- [#10](https://github.com/PuruVJ/aibind/pull/10) [`f9f2274`](https://github.com/PuruVJ/aibind/commit/f9f2274374c40bb9f432ae6546e74a1eb8d9f676) Thanks [@PuruVJ](https://github.com/PuruVJ)! - Add optimistic UI to `Chat`/`useChat`: `chat.optimistic(text)` stages a user+assistant message pair without making a request and returns a `StagedMessage` handle with `send()` and `cancel()` methods. `chat.revert()` aborts the current request and removes the last user+assistant pair, returning the user's text. `ChatMessage.optimistic` flag marks unconfirmed messages. `hasOptimistic` reactive property reflects whether any staged messages are present.

## 0.7.0

### Minor Changes

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

## 0.6.0

### Minor Changes

- [#3](https://github.com/PuruVJ/aibind/pull/3) [`d2093f2`](https://github.com/PuruVJ/aibind/commit/d2093f2a6b73e9679681e45f8cdf2247d5347c4a) Thanks [@PuruVJ](https://github.com/PuruVJ)! - Add cross-tab stream sync via BroadcastChannel. Call `stream.broadcast(channelName)` on the source and use `StreamMirror` (Svelte) or `useStreamMirror(channelName)` (React/Vue/Solid) on any mirror page — live state updates with zero extra HTTP requests.

### Patch Changes

- [#5](https://github.com/PuruVJ/aibind/pull/5) [`38ee915`](https://github.com/PuruVJ/aibind/commit/38ee915c9fa10ee228eef8637ec39acdb8442de2) Thanks [@PuruVJ](https://github.com/PuruVJ)! - Add test coverage for BroadcastChannel sync: StreamBroadcaster, StreamBroadcastReceiver, StreamController.broadcast(), and useStreamMirror across React, Vue, and Solid.

## 0.5.0

### Minor Changes

- [#1](https://github.com/PuruVJ/aibind/pull/1) [`9b0200c`](https://github.com/PuruVJ/aibind/commit/9b0200c1cdd91b7e1d1aee6f3f6ebff6064b994d) Thanks [@PuruVJ](https://github.com/PuruVJ)! - Add streaming artifacts support with reactive `artifacts` and `activeArtifact` surfaces on all stream objects. Ships three built-in detectors (`default`, `claude`, `fence`) via new `/artifact` subpath exports across all packages.

## 0.3.0

### Minor Changes

- Add abort + resume streams
  - **`@aibind/core`**: New `StreamStore` interface, `MemoryStreamStore`, `createDurableStream()`, `createResumeResponse()`, SSE utilities (`formatSSE`, `consumeSSEStream`)
  - **Client packages** (`svelte`, `vue`, `solid`): `Stream` gains `status`, `streamId`, `canResume` reactive state + `stop()`, `resume()` methods. Auto-detects SSE responses. Auto-reconnects on network drop (3 retries, exponential backoff). `StructuredStream` extends `Stream` and inherits all capabilities.
  - **Server packages** (`sveltekit`, `nuxt`, `solidstart`): `createStreamHandler` gains `resumable?: boolean` and `store?: StreamStore` options. When enabled, adds `/stop` and `/resume` endpoints.

## 0.2.0

### Minor Changes

- Add tree-structured conversation history with branching support
  - `MessageTree<M>` — Low-level tree data structure with parent-pointer traversal, sibling navigation, serialization, and active-leaf cursor tracking
  - `ChatHistory<M>` — High-level wrapper with `append()`, `edit()`, `regenerate()`, and ChatGPT-style alternative navigation
  - Reactive adapters for all frameworks: `ReactiveChatHistory` and `ReactiveMessageTree` with automatic UI updates on mutations
  - Full serialization/deserialization with cycle detection and parent-child consistency validation
  - Available via `@aibind/{svelte,vue,solid}/history` and meta-framework re-exports
