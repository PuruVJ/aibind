# Chat History

`ChatHistory` provides a high-level API for managing conversation history with branching support. Edit messages to create new branches, regenerate responses, and navigate between alternatives — like Claude's conversation UI.

## Basic Usage

### SvelteKit

```svelte
<script lang="ts">
  import { ChatHistory } from '@aibind/sveltekit/history';

  type Msg = { role: 'user' | 'assistant'; content: string };
  const chat = new ChatHistory<Msg>();
</script>

<button onclick={() => chat.append({ role: 'user', content: 'Hello!' })}>
  Add message
</button>

{#each chat.messages as msg, i}
  <div>
    <strong>{msg.role}:</strong> {msg.content}

    {#if chat.hasAlternatives(chat.nodeIds[i])}
      <button onclick={() => chat.prevAlternative(chat.nodeIds[i])}>←</button>
      <span>
        {chat.alternativeIndex(chat.nodeIds[i]) + 1}
        / {chat.alternativeCount(chat.nodeIds[i])}
      </span>
      <button onclick={() => chat.nextAlternative(chat.nodeIds[i])}>→</button>
    {/if}
  </div>
{/each}
```

### Next.js / React

```tsx
"use client";

import { ChatHistory } from "@aibind/nextjs/history";
import { useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };
const chat = new ChatHistory<Msg>();

function ChatView() {
  const { messages, nodeIds } = chat.useSnapshot();

  return (
    <div>
      <button onClick={() => chat.append({ role: "user", content: "Hello!" })}>
        Add message
      </button>
      {messages.map((msg, i) => (
        <div key={nodeIds[i]}>
          <strong>{msg.role}:</strong> {msg.content}
          {chat.hasAlternatives(nodeIds[i]) && (
            <span>
              <button onClick={() => chat.prevAlternative(nodeIds[i])}>←</button>
              {chat.alternativeIndex(nodeIds[i]) + 1}
              /{chat.alternativeCount(nodeIds[i])}
              <button onClick={() => chat.nextAlternative(nodeIds[i])}>→</button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
```

### Nuxt / Vue

```vue
<script setup lang="ts">
import { ChatHistory } from "@aibind/nuxt/history";

type Msg = { role: "user" | "assistant"; content: string };
const chat = new ChatHistory<Msg>();
</script>

<template>
  <button @click="chat.append({ role: 'user', content: 'Hello!' })">
    Add message
  </button>
  <div v-for="(msg, i) in chat.messages.value" :key="chat.nodeIds.value[i]">
    <strong>{{ msg.role }}:</strong> {{ msg.content }}
    <span v-if="chat.hasAlternatives(chat.nodeIds.value[i])">
      <button @click="chat.prevAlternative(chat.nodeIds.value[i])">←</button>
      {{ chat.alternativeIndex(chat.nodeIds.value[i]) + 1 }}
      /{{ chat.alternativeCount(chat.nodeIds.value[i]) }}
      <button @click="chat.nextAlternative(chat.nodeIds.value[i])">→</button>
    </span>
  </div>
</template>
```

### SolidStart

```tsx
import { ChatHistory } from "@aibind/solidstart/history";
import { For, Show } from "solid-js";

type Msg = { role: "user" | "assistant"; content: string };
const chat = new ChatHistory<Msg>();

function ChatView() {
  return (
    <div>
      <button onClick={() => chat.append({ role: "user", content: "Hello!" })}>
        Add message
      </button>
      <For each={chat.messages()}>
        {(msg, i) => {
          const nodeId = () => chat.nodeIds()[i()];
          return (
            <div>
              <strong>{msg.role}:</strong> {msg.content}
              <Show when={chat.hasAlternatives(nodeId())}>
                <button onClick={() => chat.prevAlternative(nodeId())}>←</button>
                {chat.alternativeIndex(nodeId()) + 1}
                /{chat.alternativeCount(nodeId())}
                <button onClick={() => chat.nextAlternative(nodeId())}>→</button>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}
```

### TanStack Start

```tsx
import { ChatHistory } from "@aibind/tanstack-start/history";

type Msg = { role: "user" | "assistant"; content: string };
const chat = new ChatHistory<Msg>();

function ChatView() {
  const { messages, nodeIds } = chat.useSnapshot();

  return (
    <div>
      <button onClick={() => chat.append({ role: "user", content: "Hello!" })}>
        Add message
      </button>
      {messages.map((msg, i) => (
        <div key={nodeIds[i]}>
          <strong>{msg.role}:</strong> {msg.content}
          {chat.hasAlternatives(nodeIds[i]) && (
            <span>
              <button onClick={() => chat.prevAlternative(nodeIds[i])}>←</button>
              {chat.alternativeIndex(nodeIds[i]) + 1}
              /{chat.alternativeCount(nodeIds[i])}
              <button onClick={() => chat.nextAlternative(nodeIds[i])}>→</button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
```

## API

### Properties (Reactive)

| Property   | Type       | Description                              |
| ---------- | ---------- | ---------------------------------------- |
| `messages` | `M[]`      | Linear message path (root → active leaf) |
| `nodeIds`  | `string[]` | Node IDs for each message                |
| `isEmpty`  | `boolean`  | Whether the history has messages         |
| `size`     | `number`   | Total messages across all branches       |

### Mutation Methods

| Method                          | Description                           |
| ------------------------------- | ------------------------------------- |
| `append(message)`               | Add message to current path           |
| `edit(messageId, newMessage)`   | Create a branch with edited message   |
| `regenerate(messageId, newMsg)` | Same as edit — creates sibling branch |

### Navigation Methods

| Method                     | Description                          |
| -------------------------- | ------------------------------------ |
| `hasAlternatives(nodeId)`  | Whether message has sibling branches |
| `alternativeCount(nodeId)` | Number of alternatives               |
| `alternativeIndex(nodeId)` | 0-based index among siblings         |
| `nextAlternative(nodeId)`  | Switch to next sibling branch        |
| `prevAlternative(nodeId)`  | Switch to previous sibling branch    |

### Persistence

```ts
// Save
const json = chat.toJSON();
localStorage.setItem("chat", json);

// Restore
const restored = ChatHistory.fromJSON<Msg>(json);
```

## How Branching Works

```
User: "Hello"
├── Assistant: "Hi!"           ← original
│   └── User: "How are you?"
└── Assistant: "Hey there!"    ← edit creates sibling
    └── User: "What's up?"
```

When you call `edit()` or `regenerate()`, a new sibling node is created. The active path switches to the new branch. Use `prevAlternative()` / `nextAlternative()` to navigate between branches.

## Reactivity by Framework

| Framework | Access pattern | Example |
|-----------|---------------|---------|
| Svelte    | Direct property | `chat.messages` |
| React     | Via hook | `const { messages } = chat.useSnapshot()` |
| Vue       | `.value` | `chat.messages.value` |
| Solid     | Function call | `chat.messages()` |
