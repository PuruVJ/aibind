# Message Trees

`MessageTree` is the low-level tree data structure that powers `ChatHistory`. Use it directly when you need full control over the tree topology.

## When to Use MessageTree vs ChatHistory

- **ChatHistory** — Simpler API for standard chat UIs (append, edit, regenerate, navigate alternatives)
- **MessageTree** — Full tree operations (addChild, branch, setActiveLeaf, remove subtrees)

## Basic Usage

::: code-group

```svelte [SvelteKit]
<script lang="ts">
  import { MessageTree } from "@aibind/sveltekit/history";

  type Msg = { role: string; content: string };
  const tree = new MessageTree<Msg>();

  const r1 = tree.append({ role: "user", content: "Hello" });
  const r2 = tree.append({ role: "assistant", content: "Hi!" });
  const alt = tree.branch(r1, { role: "assistant", content: "Hey there!" });
</script>

{#each tree.activePath.messages as msg}
  <div><strong>{msg.role}:</strong> {msg.content}</div>
{/each}

<button onclick={() => tree.nextSibling(alt)}>Next branch</button>
<button onclick={() => tree.prevSibling(r2)}>Prev branch</button>
```

```tsx [Next.js]
"use client";

import { MessageTree } from "@aibind/nextjs/history";

type Msg = { role: string; content: string };
const tree = new MessageTree<Msg>();

const r1 = tree.append({ role: "user", content: "Hello" });
const r2 = tree.append({ role: "assistant", content: "Hi!" });
const alt = tree.branch(r1, { role: "assistant", content: "Hey there!" });

function TreeView() {
  const { activePath } = tree.useSnapshot();

  return (
    <div>
      {activePath.messages.map((msg, i) => (
        <div key={activePath.nodeIds[i]}>
          <strong>{msg.role}:</strong> {msg.content}
        </div>
      ))}
      <button onClick={() => tree.nextSibling(alt)}>Next branch</button>
      <button onClick={() => tree.prevSibling(r2)}>Prev branch</button>
    </div>
  );
}
```

```vue [Nuxt]
<script setup lang="ts">
import { MessageTree } from "@aibind/nuxt/history";

type Msg = { role: string; content: string };
const tree = new MessageTree<Msg>();

const r1 = tree.append({ role: "user", content: "Hello" });
const r2 = tree.append({ role: "assistant", content: "Hi!" });
const alt = tree.branch(r1, { role: "assistant", content: "Hey there!" });
</script>

<template>
  <div
    v-for="(msg, i) in tree.activePath.value.messages"
    :key="tree.activePath.value.nodeIds[i]"
  >
    <strong>{{ msg.role }}:</strong> {{ msg.content }}
  </div>
  <button @click="tree.nextSibling(alt)">Next branch</button>
  <button @click="tree.prevSibling(r2)">Prev branch</button>
</template>
```

```tsx [SolidStart]
import { MessageTree } from "@aibind/solidstart/history";
import { For } from "solid-js";

type Msg = { role: string; content: string };
const tree = new MessageTree<Msg>();

const r1 = tree.append({ role: "user", content: "Hello" });
const r2 = tree.append({ role: "assistant", content: "Hi!" });
const alt = tree.branch(r1, { role: "assistant", content: "Hey there!" });

function TreeView() {
  return (
    <div>
      <For each={tree.activePath().messages}>
        {(msg, i) => (
          <div>
            <strong>{msg.role}:</strong> {msg.content}
          </div>
        )}
      </For>
      <button onClick={() => tree.nextSibling(alt)}>Next branch</button>
      <button onClick={() => tree.prevSibling(r2)}>Prev branch</button>
    </div>
  );
}
```

```tsx [TanStack Start]
import { MessageTree } from "@aibind/tanstack-start/history";

type Msg = { role: string; content: string };
const tree = new MessageTree<Msg>();

const r1 = tree.append({ role: "user", content: "Hello" });
const r2 = tree.append({ role: "assistant", content: "Hi!" });
const alt = tree.branch(r1, { role: "assistant", content: "Hey there!" });

function TreeView() {
  const { activePath } = tree.useSnapshot();

  return (
    <div>
      {activePath.messages.map((msg, i) => (
        <div key={activePath.nodeIds[i]}>
          <strong>{msg.role}:</strong> {msg.content}
        </div>
      ))}
      <button onClick={() => tree.nextSibling(alt)}>Next branch</button>
      <button onClick={() => tree.prevSibling(r2)}>Prev branch</button>
    </div>
  );
}
```

:::

## Properties (Reactive)

| Property       | Type                | Description                |
| -------------- | ------------------- | -------------------------- |
| `size`         | `number`            | Total nodes in the tree    |
| `isEmpty`      | `boolean`           | Whether tree has any nodes |
| `activeLeafId` | `string \| null`    | Currently active leaf node |
| `rootIds`      | `readonly string[]` | IDs of root-level nodes    |
| `activePath`   | `TreePath<M>`       | Messages from root to leaf |

## Mutation Methods

| Method                        | Description                            |
| ----------------------------- | -------------------------------------- |
| `append(message, metadata?)`  | Add to active path                     |
| `addRoot(message, metadata?)` | Add new root node                      |
| `addChild(parentId, msg)`     | Add child without changing active leaf |
| `branch(parentId, msg)`       | Add child AND set as active leaf       |
| `setActiveLeaf(nodeId)`       | Change which leaf is active            |
| `remove(nodeId)`              | Remove subtree                         |

## Query Methods

| Method                | Description                    |
| --------------------- | ------------------------------ |
| `get(id)`             | Get node by ID                 |
| `has(id)`             | Check if node exists           |
| `getPathTo(nodeId)`   | Get path from root to any node |
| `getSiblings(nodeId)` | Get sibling nodes and index    |
| `depth(nodeId)`       | Distance from root             |
| `getLeaves()`         | All leaf nodes                 |

## Serialization

```ts
// Serialize
const data = tree.serialize();

// Deserialize
const restored = MessageTree.deserialize(data);
```
