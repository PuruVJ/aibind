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

Add toolset-based tool calling to chat: register named tool collections on the server via `createStreamHandler({ toolsets: { ... } })`, select them per chat instance via `useChat({ toolset, maxSteps, onToolCall })`. Upgrades the `/chat` wire protocol from plain text to SSE (same as `/stream`) to support `tool_call` events for real-time UI feedback.
