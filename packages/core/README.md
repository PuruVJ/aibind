# @aibind/core

Shared core utilities for `@aibind` packages. Framework-agnostic controllers, tree-structured conversation history, durable stream infrastructure, and project management.

## Install

```bash
npm install @aibind/core
```

> Most users should install a framework package (`@aibind/sveltekit`, `@aibind/nuxt`, `@aibind/nextjs`, `@aibind/solidstart`) instead, which includes this package automatically.

## What's Inside

### Controllers

Framework-agnostic controllers that power all framework packages:

- `StreamController` — manages streaming text state, abort/resume, SSE reconnection
- `StructuredStreamController` — streaming JSON parsing with schema validation
- `AgentController` — multi-step tool-calling agent state

### Tree-Structured Conversation History

- `MessageTree<M>` — low-level tree data structure with full branching support
- `ChatHistory<M>` — high-level wrapper for append, edit, regenerate, and navigate alternatives

### Durable Streams

Server-side infrastructure for resumable AI streams:

- `MemoryStreamStore` — in-memory stream chunk storage with TTL
- `createDurableStream` — pipes async iterables through a store, returns SSE Response
- `createResumeResponse` — resume from a given sequence number
- SSE utilities: `formatSSE`, `formatSSEEvent`, `consumeSSEStream`

### Server Handler

- `createStreamHandler` — generic Web Request/Response handler for `/stream` and `/structured` endpoints
- `ServerAgent` — server-side agent with tools and multi-step loops

### Project Management

- `Project` — Claude-like project context with instructions, knowledge, and multi-conversation management

## Documentation

Full documentation, API reference, and guides: **[aibind.dev](https://aibind.dev)**

- [Streaming](https://aibind.dev/concepts/streaming)
- [Structured Output](https://aibind.dev/concepts/structured-output)
- [Chat History & Branching](https://aibind.dev/concepts/chat-history)
- [Message Trees](https://aibind.dev/concepts/message-trees)
- [Durable Streams](https://aibind.dev/concepts/durable-streams)
- [Projects](https://aibind.dev/concepts/projects)

## License

MIT
