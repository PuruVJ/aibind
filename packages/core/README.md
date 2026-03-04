# @aibind/core

Shared core utilities for `@aibind` packages. Includes tree-structured conversation history with branching support, and durable stream infrastructure for abort + resume.

## Tree-Structured Conversation History

Real AI conversations are tree-shaped. Every time a user edits a message, regenerates a response, or forks a thread, the history branches. Linear arrays can't represent this — a tree can.

`@aibind/core` provides two layers:

- **`MessageTree<M>`** — Low-level tree data structure. Full control over nodes, siblings, and active paths.
- **`ChatHistory<M>`** — High-level wrapper for common chat operations: append, edit, regenerate, navigate alternatives.

Both are generic over any message type `M` and completely framework-agnostic. Use them in any JavaScript/TypeScript environment.

## Quick Start

```ts
import { ChatHistory } from "@aibind/core";

const chat = new ChatHistory<{ role: string; content: string }>();

// Normal conversation
const m1 = chat.append({ role: "user", content: "Hello" });
const m2 = chat.append({ role: "assistant", content: "Hi!" });
chat.messages; // [{ role: 'user', ... }, { role: 'assistant', ... }]

// Edit creates a branch
const m1b = chat.edit(m1, { role: "user", content: "Hey there" });
chat.messages; // [{ role: 'user', content: 'Hey there' }]

// Regenerate assistant response
const m2b = chat.regenerate(m2, {
  role: "assistant",
  content: "Hello! How can I help?",
});

// Navigate alternatives (ChatGPT-style)
chat.hasAlternatives(m2); // true
chat.nextAlternative(m2); // switches branch
chat.prevAlternative(m2b); // switches back
```

## ChatHistory API

### Mutations

| Method                               | Description                                                            |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `append(message)`                    | Append a message to the current path.                                  |
| `edit(messageId, newMessage)`        | Create a new branch from the parent of `messageId` (edit).             |
| `regenerate(messageId, newResponse)` | Create a new sibling of `messageId` from the same parent (regenerate). |

### Reading State

| Property / Method | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `messages`        | Linear message array from root to active leaf.       |
| `nodeIds`         | Corresponding node IDs for each message in the path. |
| `isEmpty`         | `true` if the history has no messages.               |
| `size`            | Total number of messages across all branches.        |

### Navigating Alternatives

| Method                     | Description                            |
| -------------------------- | -------------------------------------- |
| `hasAlternatives(nodeId)`  | Whether a node has sibling branches.   |
| `alternativeCount(nodeId)` | Number of siblings (including itself). |
| `alternativeIndex(nodeId)` | Zero-based index among siblings.       |
| `nextAlternative(nodeId)`  | Switch to the next sibling branch.     |
| `prevAlternative(nodeId)`  | Switch to the previous sibling branch. |

### Serialization

| Method                       | Description                                 |
| ---------------------------- | ------------------------------------------- |
| `toJSON()`                   | Serialize the full tree to a JSON string.   |
| `ChatHistory.fromJSON(json)` | Restore a `ChatHistory` from a JSON string. |

### Advanced

| Property | Description                                   |
| -------- | --------------------------------------------- |
| `tree`   | Access the underlying `MessageTree` directly. |

## MessageTree API

### Queries

| Method / Property | Description                         |
| ----------------- | ----------------------------------- |
| `size`            | Total number of nodes.              |
| `isEmpty`         | `true` if the tree has no nodes.    |
| `activeLeafId`    | ID of the current active leaf node. |
| `rootIds`         | Array of root node IDs.             |
| `get(id)`         | Get a node by ID.                   |
| `has(id)`         | Check if a node exists.             |

### Active Path

| Method              | Description                                |
| ------------------- | ------------------------------------------ |
| `getActivePath()`   | Get the path from root to the active leaf. |
| `getPathTo(nodeId)` | Get the path from root to a specific node. |

### Mutations

| Method                                   | Description                                 |
| ---------------------------------------- | ------------------------------------------- |
| `append(message, metadata?)`             | Append to the active leaf (or create root). |
| `addChild(parentId, message, metadata?)` | Add a child to a specific node.             |
| `addRoot(message, metadata?)`            | Add a new root node.                        |
| `branch(parentId, message, metadata?)`   | Create a new branch from a parent node.     |

### Navigation

| Method                  | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| `setActiveLeaf(nodeId)` | Set which leaf is active.                            |
| `getSiblings(nodeId)`   | Get all sibling node IDs.                            |
| `nextSibling(nodeId)`   | Move to the next sibling and update active path.     |
| `prevSibling(nodeId)`   | Move to the previous sibling and update active path. |

### Serialization

| Method                          | Description                           |
| ------------------------------- | ------------------------------------- |
| `serialize()`                   | Serialize the tree to a plain object. |
| `MessageTree.deserialize(data)` | Restore a tree from serialized data.  |

### Utility

| Method           | Description                         |
| ---------------- | ----------------------------------- |
| `depth(nodeId)`  | Get the depth of a node (root = 0). |
| `getLeaves()`    | Get all leaf node IDs.              |
| `remove(nodeId)` | Remove a node and its descendants.  |

## Durable Streams (Abort + Resume)

Server-side infrastructure for resumable AI streams. Decouples LLM generation from client delivery — the server buffers chunks with sequence numbers, so clients can stop generation, reconnect after network drops, and resume from where they left off.

Solves [Vercel AI SDK #8390](https://github.com/vercel/ai/issues/8390) — you can't have both stop-generation and resume-on-disconnect when they share the same `AbortController.signal`.

### StreamStore

Pluggable storage backend that buffers chunks with sequence numbers.

```ts
import { MemoryStreamStore } from "@aibind/core";

const store = new MemoryStreamStore(); // 5-minute TTL default
const store = new MemoryStreamStore({ ttlMs: 10 * 60 * 1000 }); // custom TTL
```

Implement the `StreamStore` interface for any backend (Redis, database, etc.):

| Method                   | Description                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `create(id)`             | Create a new stream entry.                                                                      |
| `append(id, chunk)`      | Append a chunk. Returns the sequence number (1-based).                                          |
| `readFrom(id, afterSeq)` | Async generator yielding chunks after `afterSeq`. Waits for new chunks if the stream is active. |
| `getStatus(id)`          | Get current status: `active`, `done`, `stopped`, or `error`.                                    |
| `stop(id)`               | Signal the stream to stop (user-initiated).                                                     |
| `complete(id)`           | Mark the stream as completed.                                                                   |
| `fail(id, error)`        | Mark the stream as failed.                                                                      |

### createDurableStream

Pipes an async iterable (e.g. `streamText().textStream`) through a `StreamStore` and returns an SSE `Response`.

```ts
import { createDurableStream, MemoryStreamStore } from "@aibind/core";
import { streamText } from "ai";

const store = new MemoryStreamStore();
const result = streamText({ model, prompt });

const { streamId, response, controller } = await createDurableStream({
  store,
  source: result.textStream,
});
// response  → SSE streaming Response to send to the client
// controller.abort() → stops the LLM generation
// streamId  → identifies this stream for resume/stop
```

### createResumeResponse

Resume a stream from a given sequence number:

```ts
import { createResumeResponse } from "@aibind/core";

const response = createResumeResponse({
  store,
  streamId: "abc123",
  afterSeq: 5, // resume from chunk 6 onwards
});
```

### SSE Utilities

Low-level SSE formatting and parsing:

```ts
import { formatSSE, formatSSEEvent, consumeSSEStream } from "@aibind/core";

// Server: format chunks
formatSSE(1, "Hello"); // "id: 1\ndata: Hello\n\n"
formatSSEEvent("done"); // "event: done\ndata: \n\n"

// Client: parse SSE stream
for await (const msg of consumeSSEStream(response)) {
  msg.id; // sequence number
  msg.data; // chunk text
  msg.event; // "stream-id" | "done" | "stopped" | "error" | ""
}
```

## Framework Adapters

The core classes are plain TypeScript. Each framework package provides reactive wrappers that integrate with the framework's reactivity system.

| Package              | Import                       | Reactive Class                               |
| -------------------- | ---------------------------- | -------------------------------------------- |
| `@aibind/svelte`     | `@aibind/svelte/history`     | `ReactiveChatHistory`, `ReactiveMessageTree` |
| `@aibind/vue`        | `@aibind/vue/history`        | `ReactiveChatHistory`, `ReactiveMessageTree` |
| `@aibind/solid`      | `@aibind/solid/history`      | `ReactiveChatHistory`, `ReactiveMessageTree` |
| `@aibind/sveltekit`  | `@aibind/sveltekit/history`  | Re-exports from Svelte                       |
| `@aibind/nuxt`       | `@aibind/nuxt/history`       | Re-exports from Vue                          |
| `@aibind/solidstart` | `@aibind/solidstart/history` | Re-exports from Solid                        |

### Svelte 5

```svelte
<script>
  import { ReactiveChatHistory } from '@aibind/svelte/history';
  const chat = new ReactiveChatHistory();
  chat.append({ role: 'user', content: 'Hello' });
</script>
{#each chat.messages as msg}
  <p>{msg.content}</p>
{/each}
```

### Vue 3

```vue
<script setup>
import { ReactiveChatHistory } from "@aibind/vue/history";
const chat = new ReactiveChatHistory();
chat.append({ role: "user", content: "Hello" });
</script>
<template>
  <p v-for="msg in chat.messages.value">{{ msg.content }}</p>
</template>
```

### SolidJS

```tsx
import { ReactiveChatHistory } from "@aibind/solid/history";
const chat = new ReactiveChatHistory();
chat.append({ role: "user", content: "Hello" });
return <For each={chat.messages()}>{(msg) => <p>{msg.content}</p>}</For>;
```

## Serialization

Persist and restore conversation trees, including all branches:

```ts
// Save
const json = chat.toJSON();
localStorage.setItem("chat", json);

// Restore
const restored = ChatHistory.fromJSON(localStorage.getItem("chat")!);
```

## Types

Exported types from `@aibind/core`:

- **`TreeNode<M>`** — A single node in the tree (message, parent, children, metadata).
- **`TreeConfig`** — Configuration options for tree construction.
- **`SerializedTree<M>`** — Shape of the serialized tree data.
- **`TreePath<M>`** — A linear path of nodes from root to a specific node.
- **`StreamStore`** — Interface for pluggable stream storage backends.
- **`StreamChunk`** — A single chunk with a sequence number.
- **`StreamStatus`** — Current state of a durable stream (`active | done | stopped | error`).
- **`SSEMessage`** — Parsed SSE message (`id`, `data`, `event`).
- **`DurableStreamOptions`** — Options for `createDurableStream()`.
- **`DurableStreamResult`** — Return type of `createDurableStream()`.
