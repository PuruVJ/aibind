# @aibind/core

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
