# @aibind/nuxt

## 0.5.0

### Minor Changes

- [#1](https://github.com/PuruVJ/aibind/pull/1) [`9b0200c`](https://github.com/PuruVJ/aibind/commit/9b0200c1cdd91b7e1d1aee6f3f6ebff6064b994d) Thanks [@PuruVJ](https://github.com/PuruVJ)! - Add streaming artifacts support with reactive `artifacts` and `activeArtifact` surfaces on all stream objects. Ships three built-in detectors (`default`, `claude`, `fence`) via new `/artifact` subpath exports across all packages.

### Patch Changes

- Updated dependencies [[`9b0200c`](https://github.com/PuruVJ/aibind/commit/9b0200c1cdd91b7e1d1aee6f3f6ebff6064b994d)]:
  - @aibind/core@0.5.0
  - @aibind/vue@0.5.0

## 0.3.0

### Minor Changes

- Add abort + resume streams
  - **`@aibind/core`**: New `StreamStore` interface, `MemoryStreamStore`, `createDurableStream()`, `createResumeResponse()`, SSE utilities (`formatSSE`, `consumeSSEStream`)
  - **Client packages** (`svelte`, `vue`, `solid`): `Stream` gains `status`, `streamId`, `canResume` reactive state + `stop()`, `resume()` methods. Auto-detects SSE responses. Auto-reconnects on network drop (3 retries, exponential backoff). `StructuredStream` extends `Stream` and inherits all capabilities.
  - **Server packages** (`sveltekit`, `nuxt`, `solidstart`): `createStreamHandler` gains `resumable?: boolean` and `store?: StreamStore` options. When enabled, adds `/stop` and `/resume` endpoints.

### Patch Changes

- Updated dependencies []:
  - @aibind/core@0.3.0
  - @aibind/vue@0.3.0

## 0.2.0

### Minor Changes

- Add tree-structured conversation history with branching support
  - `MessageTree<M>` — Low-level tree data structure with parent-pointer traversal, sibling navigation, serialization, and active-leaf cursor tracking
  - `ChatHistory<M>` — High-level wrapper with `append()`, `edit()`, `regenerate()`, and ChatGPT-style alternative navigation
  - Reactive adapters for all frameworks: `ReactiveChatHistory` and `ReactiveMessageTree` with automatic UI updates on mutations
  - Full serialization/deserialization with cycle detection and parent-child consistency validation
  - Available via `@aibind/{svelte,vue,solid}/history` and meta-framework re-exports

### Patch Changes

- Updated dependencies []:
  - @aibind/core@0.2.0
  - @aibind/vue@0.2.0
