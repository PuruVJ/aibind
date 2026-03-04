# @aibind/core

Shared core utilities for `@aibind` packages. Includes tree-structured conversation history with branching support.

## Tree-Structured Conversation History

Real AI conversations are tree-shaped. Every time a user edits a message, regenerates a response, or forks a thread, the history branches. Linear arrays can't represent this — a tree can.

`@aibind/core` provides two layers:

- **`MessageTree<M>`** — Low-level tree data structure. Full control over nodes, siblings, and active paths.
- **`ChatHistory<M>`** — High-level wrapper for common chat operations: append, edit, regenerate, navigate alternatives.

Both are generic over any message type `M` and completely framework-agnostic. Use them in any JavaScript/TypeScript environment.

## Quick Start

```ts
import { ChatHistory } from '@aibind/core';

const chat = new ChatHistory<{ role: string; content: string }>();

// Normal conversation
const m1 = chat.append({ role: 'user', content: 'Hello' });
const m2 = chat.append({ role: 'assistant', content: 'Hi!' });
chat.messages; // [{ role: 'user', ... }, { role: 'assistant', ... }]

// Edit creates a branch
const m1b = chat.edit(m1, { role: 'user', content: 'Hey there' });
chat.messages; // [{ role: 'user', content: 'Hey there' }]

// Regenerate assistant response
const m2b = chat.regenerate(m2, { role: 'assistant', content: 'Hello! How can I help?' });

// Navigate alternatives (ChatGPT-style)
chat.hasAlternatives(m2);  // true
chat.nextAlternative(m2);  // switches branch
chat.prevAlternative(m2b); // switches back
```

## ChatHistory API

### Mutations

| Method | Description |
|--------|-------------|
| `append(message)` | Append a message to the current path. |
| `edit(messageId, newMessage)` | Create a new branch from the parent of `messageId` (edit). |
| `regenerate(messageId, newResponse)` | Create a new sibling of `messageId` from the same parent (regenerate). |

### Reading State

| Property / Method | Description |
|-------------------|-------------|
| `messages` | Linear message array from root to active leaf. |
| `nodeIds` | Corresponding node IDs for each message in the path. |
| `isEmpty` | `true` if the history has no messages. |
| `size` | Total number of messages across all branches. |

### Navigating Alternatives

| Method | Description |
|--------|-------------|
| `hasAlternatives(nodeId)` | Whether a node has sibling branches. |
| `alternativeCount(nodeId)` | Number of siblings (including itself). |
| `alternativeIndex(nodeId)` | Zero-based index among siblings. |
| `nextAlternative(nodeId)` | Switch to the next sibling branch. |
| `prevAlternative(nodeId)` | Switch to the previous sibling branch. |

### Serialization

| Method | Description |
|--------|-------------|
| `toJSON()` | Serialize the full tree to a JSON string. |
| `ChatHistory.fromJSON(json)` | Restore a `ChatHistory` from a JSON string. |

### Advanced

| Property | Description |
|----------|-------------|
| `tree` | Access the underlying `MessageTree` directly. |

## MessageTree API

### Queries

| Method / Property | Description |
|-------------------|-------------|
| `size` | Total number of nodes. |
| `isEmpty` | `true` if the tree has no nodes. |
| `activeLeafId` | ID of the current active leaf node. |
| `rootIds` | Array of root node IDs. |
| `get(id)` | Get a node by ID. |
| `has(id)` | Check if a node exists. |

### Active Path

| Method | Description |
|--------|-------------|
| `getActivePath()` | Get the path from root to the active leaf. |
| `getPathTo(nodeId)` | Get the path from root to a specific node. |

### Mutations

| Method | Description |
|--------|-------------|
| `append(message, metadata?)` | Append to the active leaf (or create root). |
| `addChild(parentId, message, metadata?)` | Add a child to a specific node. |
| `addRoot(message, metadata?)` | Add a new root node. |
| `branch(parentId, message, metadata?)` | Create a new branch from a parent node. |

### Navigation

| Method | Description |
|--------|-------------|
| `setActiveLeaf(nodeId)` | Set which leaf is active. |
| `getSiblings(nodeId)` | Get all sibling node IDs. |
| `nextSibling(nodeId)` | Move to the next sibling and update active path. |
| `prevSibling(nodeId)` | Move to the previous sibling and update active path. |

### Serialization

| Method | Description |
|--------|-------------|
| `serialize()` | Serialize the tree to a plain object. |
| `MessageTree.deserialize(data)` | Restore a tree from serialized data. |

### Utility

| Method | Description |
|--------|-------------|
| `depth(nodeId)` | Get the depth of a node (root = 0). |
| `getLeaves()` | Get all leaf node IDs. |
| `remove(nodeId)` | Remove a node and its descendants. |

## Framework Adapters

The core classes are plain TypeScript. Each framework package provides reactive wrappers that integrate with the framework's reactivity system.

| Package | Import | Reactive Class |
|---------|--------|----------------|
| `@aibind/svelte` | `@aibind/svelte/history` | `ReactiveChatHistory`, `ReactiveMessageTree` |
| `@aibind/vue` | `@aibind/vue/history` | `ReactiveChatHistory`, `ReactiveMessageTree` |
| `@aibind/solid` | `@aibind/solid/history` | `ReactiveChatHistory`, `ReactiveMessageTree` |
| `@aibind/sveltekit` | `@aibind/sveltekit/history` | Re-exports from Svelte |
| `@aibind/nuxt` | `@aibind/nuxt/history` | Re-exports from Vue |
| `@aibind/solidstart` | `@aibind/solidstart/history` | Re-exports from Solid |

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
import { ReactiveChatHistory } from '@aibind/vue/history';
const chat = new ReactiveChatHistory();
chat.append({ role: 'user', content: 'Hello' });
</script>
<template>
  <p v-for="msg in chat.messages.value">{{ msg.content }}</p>
</template>
```

### SolidJS

```tsx
import { ReactiveChatHistory } from '@aibind/solid/history';
const chat = new ReactiveChatHistory();
chat.append({ role: 'user', content: 'Hello' });
return <For each={chat.messages()}>{msg => <p>{msg.content}</p>}</For>;
```

## Serialization

Persist and restore conversation trees, including all branches:

```ts
// Save
const json = chat.toJSON();
localStorage.setItem('chat', json);

// Restore
const restored = ChatHistory.fromJSON(localStorage.getItem('chat')!);
```

## Types

Exported types from `@aibind/core`:

- **`TreeNode<M>`** — A single node in the tree (message, parent, children, metadata).
- **`TreeConfig`** — Configuration options for tree construction.
- **`SerializedTree<M>`** — Shape of the serialized tree data.
- **`TreePath<M>`** — A linear path of nodes from root to a specific node.
