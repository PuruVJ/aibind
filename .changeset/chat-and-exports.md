---
"@aibind/core": minor
"@aibind/svelte": minor
"@aibind/sveltekit": minor
"@aibind/react": minor
"@aibind/vue": minor
"@aibind/solid": minor
"@aibind/nextjs": patch
"@aibind/react-router": patch
"@aibind/tanstack-start": patch
"@aibind/nuxt": patch
"@aibind/solidstart": patch
---

Add `Chat`/`useChat` — high-level multi-turn conversational hook across all framework packages.

- **`@aibind/core`**: new `ChatController` class and `StreamHandler.chat()` endpoint (`POST /__aibind__/chat`)
- **`@aibind/svelte`**: new reactive `Chat` class with `$state` fields, `send`, `abort`, `clear`, `regenerate`, `edit`
- **`@aibind/sveltekit`**: `Chat` and `Race` with default endpoints (`/__aibind__/chat`, `/__aibind__/stream`); `Chat`, `Race`, `Completion` now exported at top level
- **`@aibind/react`**: `useChat` hook; `useRace`, `useCompletion` already present
- **`@aibind/vue`**: `useChat` composable
- **`@aibind/solid`**: `useChat` hook
- **`@aibind/nextjs`, `react-router`, `tanstack-start`**: re-export `useChat`, `useRace`, `useCompletion` from `@aibind/react`
- **`@aibind/nuxt`**: re-export `useChat`, `useRace`, `useCompletion` from `@aibind/vue`
- **`@aibind/solidstart`**: re-export `useChat`, `useRace`, `useCompletion` from `@aibind/solid`
