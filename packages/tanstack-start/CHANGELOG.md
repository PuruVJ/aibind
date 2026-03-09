# @aibind/tanstack-start

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
