---
"@aibind/core": minor
"@aibind/svelte": minor
"@aibind/sveltekit": minor
"@aibind/react": minor
"@aibind/vue": minor
"@aibind/solid": minor
---

Add optimistic UI to `Chat`/`useChat`: `chat.optimistic(text)` stages a user+assistant message pair without making a request and returns a `StagedMessage` handle with `send()` and `cancel()` methods. `chat.revert()` aborts the current request and removes the last user+assistant pair, returning the user's text. `ChatMessage.optimistic` flag marks unconfirmed messages. `hasOptimistic` reactive property reflects whether any staged messages are present.
