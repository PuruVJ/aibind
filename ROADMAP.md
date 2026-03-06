# @aibind Roadmap

Pain points and gaps in the AI frontend ecosystem that no library solves well. Sourced from blog posts, GitHub issues, and community discussions.

---

## Up Next

- [x] Streaming Markdown Renderer (`@aibind/markdown`)
- [x] Tree-Structured Conversation History (`MessageTree` + `ChatHistory`)
- [ ] Tool Calling UI Components

---

## High Priority

- [x] **Streaming Markdown Renderer** — No Svelte/Vue/Solid solution exists. Vercel's [Streamdown](https://streamdown.ai/) is React-only. The "Flash of Incomplete Markdown" (FOIM) problem affects every AI chat. Unterminated bold, partial code blocks, and split links cause rendering glitches. Need: framework-agnostic incremental parser + framework-specific components.

- [x] **Conversation Branching / Tree-Structured History** — `MessageTree<M>` (low-level tree) + `ChatHistory<M>` (high-level wrapper) in `@aibind/core`. Reactive adapters (`ReactiveChatHistory`, `ReactiveMessageTree`) for Svelte, Vue, Solid. Supports append, edit, regenerate, sibling navigation, serialization. [Vercel AI SDK #2929](https://github.com/vercel/ai/issues/2929) — we ship what they haven't.

- [ ] **Tool Calling UI Components** — AI SDK 6 introduced the protocol for tool calls, but actual rendering (progress indicators, typed result cards, chain visualizations, error handling) is left to developers. No reusable components exist outside React (assistant-ui). Need: `<ToolExecution>`, `<ToolResult>`, `<ToolChain>`, `<ToolApproval>`, `<ToolError>` primitives.

- [ ] **Client-Side Token/Cost Tracking** — Every production AI app needs this, everyone builds it ad-hoc. No library exposes token usage as reactive state. Need: reactive token/cost tracker that extracts usage from AI SDK responses, maintains running totals, handles multi-model pricing, persists to IndexedDB.

## Medium Priority

- [x] **Edit/Regenerate/Retry as First-Class State Operations** — Solved by `ChatHistory.edit()` and `ChatHistory.regenerate()`. Creates sibling branches automatically, with `nextAlternative()`/`prevAlternative()` for version navigation. Branching demo app included in sveltekit-demo playground.

- [ ] **Client-Side Chat Persistence (Offline-First)** — AI SDK documents persistence but leaves implementation to you. No open-source IndexedDB-backed conversation store that just works. Need: automatic save, conversation listing/search/deletion, export/import, optional server sync, offline via Service Workers.

- [x] **Abort + Resume Compatibility** — Durable streams with decoupled generation/delivery. `StreamStore` buffers chunks with sequence numbers, `createDurableStream()` pipes through SSE, clients auto-detect and support `stop()`, `resume()`, and auto-reconnect. Server handlers opt-in with `resumable: true`. Solves [Vercel AI SDK #8390](https://github.com/vercel/ai/issues/8390).

- [ ] **Client-Side Rate Limiting & Request Management** — Users spam the send button, causing duplicate requests. No client-side request queue, deduplication, or backoff exists in any AI frontend library. Need: request manager with queue, dedup, exponential backoff, and reactive queue state.

## Lower Priority / Exploratory

- [x] **Multi-Model Switching with Unified State** — `Stream<ModelKey>` supports persistent model switching (`stream.model = "smart"`), per-send overrides, and `routeModel` for automatic routing. `routeByLength` utility ships as the canonical built-in strategy.

- [ ] **Multi-Model Racing / Fan-out** — Send the same prompt to N models simultaneously; use the first to complete or pick by score. Eliminates the latency vs quality tradeoff: race a cheap fast model against a powerful one, display whichever finishes first. No library does this client-side without custom fetch orchestration.

- [ ] **Streaming Diff on Regenerate** — When a user regenerates a response, show what changed vs the previous one (git-diff style highlights). `stream.diff` exposes `Array<{ type: "add" | "remove" | "keep", text }>` alongside `stream.text`. ChatGPT and Claude have nothing like this. Superpower for any edit/improve workflow.

- [x] **Inline Completions (`Completion` class)** — Debounced, as-you-type completions with ghost text: a totally different interaction model from chat. `completion.update(input)` debounces, cancels in-flight, surfaces `completion.suggestion`. `completion.accept()` appends the suggestion. Covers writing assistants, search boxes, code inputs — shapes AI SDK can't address.

- [ ] **Prompt Variants / A/B Testing** — Define multiple system prompt variants, assign users deterministically, track which performs better via callbacks. Every serious AI product runs prompt experiments; nobody has a library-level answer. `defineVariants` + `onVariantResult` callback covers the full loop without a separate experiment platform.

- [ ] **Automatic Prompt Cache Hints** — Anthropic charges 10% for cached input tokens vs 100% for fresh. The only thing needed is a `cache_control` breakpoint on the system prompt, but wiring it correctly requires knowing the provider. `cacheSystemPrompt: true` on `createStreamHandler` adds it transparently for Anthropic models — zero user effort, meaningful cost savings.

- [ ] **Local-First / Hybrid AI (Browser + Cloud)** — WebGPU + WASM enables running small LLMs in-browser. No library provides seamless "hybrid" mode: local model for simple tasks, cloud for complex, offline fallback.

- [ ] **Collaborative / Multi-User AI Chat** — ChatGPT has group chats, Copilot supports 32 participants. No embeddable library provides multi-user AI chat with real-time sync.

- [ ] **Generative UI for Svelte** — AI SDK supports generative UI in React via RSC. Zero Svelte support. AI tool calls return component identifiers + props → renderer dynamically instantiates registered Svelte components.

- [ ] **Streaming Protocol Standardization** — No standard protocol for streaming AI responses. Every framework uses a different format (Vercel data stream, Mastra, AG-UI, LangChain, OpenAI SSE). Need: server-agnostic transport layer.

---

## Completed

- [x] `@aibind/svelte` — Svelte 5 rune-based streaming classes
- [x] `@aibind/sveltekit` — SvelteKit integration with server handlers
- [x] `@aibind/vue` — Vue 3 composables
- [x] `@aibind/nuxt` — Nuxt integration with server handlers
- [x] `@aibind/solid` — SolidJS signal-based hooks
- [x] `@aibind/solidstart` — SolidStart integration with server handlers
- [x] `@aibind/core` — Shared utilities (stream-utils, ServerAgent)
- [x] `@aibind/markdown` — Streaming markdown parser with recovery (1M ops/s)
- [x] Tree-structured conversation history — `MessageTree<M>` + `ChatHistory<M>` + reactive adapters for all frameworks
- [x] Abort + Resume Streams — Durable streams (`StreamStore`, `MemoryStreamStore`, `createDurableStream`), SSE utilities, `Stream.stop()`/`resume()`, auto-reconnect, `resumable: true` handler option
- [x] Model routing — `routeModel` hook + `routeByLength` utility; priority chain: explicit send override > router > constructor default; async router support with abort guard

---

_Sources: [Streaming Structured Output Is Still Broken](https://schnabl.cx/blog/streaming-structured-output.html), [AI Chat Tools Don't Match How We Think](https://medium.com/@nikivergis/ai-chat-tools-dont-match-how-we-actually-think-exploring-the-ux-of-branching-conversations-259107496afb), [Preventing FOIM](https://engineering.streak.com/p/preventing-unstyled-markdown-streaming-ai), [Vercel AI SDK Bloat](https://blog.hyperknot.com/p/til-vercel-ai-sdk-the-bloat-king), [TanStack AI vs Vercel AI SDK](https://www.better-stack.ai/p/blog/vercel-ai-sdk-vs-tanstack-ai-2026-best-ai-sdk-for-developers)_
