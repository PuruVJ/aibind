# Projects

Projects let you manage multiple conversations that share a common context — like Claude's Projects feature. Each project has instructions (system prompt), knowledge snippets, and a set of conversations.

## Basic Usage

### SvelteKit

```svelte
<script lang="ts">
  import { Project } from '@aibind/sveltekit/project';

  const project = new Project({
    name: "My App",
    instructions: "You are a coding assistant for a React TypeScript app.",
    knowledge: [
      "The app uses Next.js 15 with the app router.",
      "State management is done with Zustand.",
      "The database is PostgreSQL with Drizzle ORM.",
    ],
    model: "smart",
  });

  const { id, history } = project.createConversation("Bug fix discussion");
</script>

<p>{project.name}</p>
<p>{project.conversationList.length} conversations</p>

<button onclick={() => project.addKnowledge("Uses TailwindCSS v4.")}>
  Add knowledge
</button>

{#each project.conversationList as conv}
  <div>{conv.title} — {conv.messageCount} messages</div>
{/each}
```

### Next.js / React

```tsx
"use client";

import { Project } from "@aibind/nextjs/project";

const project = new Project({
  name: "My App",
  instructions: "You are a coding assistant for a React TypeScript app.",
  knowledge: [
    "The app uses Next.js 15 with the app router.",
    "State management is done with Zustand.",
    "The database is PostgreSQL with Drizzle ORM.",
  ],
  model: "smart",
});

function ProjectView() {
  const { name, systemPrompt, conversations } = project.useSnapshot();

  return (
    <div>
      <h1>{name}</h1>
      <p>{conversations.length} conversations</p>
      <button onClick={() => project.addKnowledge("Uses TailwindCSS v4.")}>
        Add knowledge
      </button>
      {conversations.map((conv) => (
        <div key={conv.id}>{conv.title} — {conv.messageCount} messages</div>
      ))}
    </div>
  );
}
```

### Nuxt / Vue

```vue
<script setup lang="ts">
import { Project } from "@aibind/nuxt/project";

const project = new Project({
  name: "My App",
  instructions: "You are a coding assistant for a React TypeScript app.",
  knowledge: [
    "The app uses Next.js 15 with the app router.",
    "State management is done with Zustand.",
    "The database is PostgreSQL with Drizzle ORM.",
  ],
  model: "smart",
});
</script>

<template>
  <h1>{{ project.name.value }}</h1>
  <p>{{ project.conversationList.value.length }} conversations</p>
  <button @click="project.addKnowledge('Uses TailwindCSS v4.')">
    Add knowledge
  </button>
  <div v-for="conv in project.conversationList.value" :key="conv.id">
    {{ conv.title }} — {{ conv.messageCount }} messages
  </div>
</template>
```

### SolidStart

```tsx
import { Project } from "@aibind/solidstart/project";
import { For } from "solid-js";

const project = new Project({
  name: "My App",
  instructions: "You are a coding assistant for a React TypeScript app.",
  knowledge: [
    "The app uses Next.js 15 with the app router.",
    "State management is done with Zustand.",
    "The database is PostgreSQL with Drizzle ORM.",
  ],
  model: "smart",
});

function ProjectView() {
  return (
    <div>
      <h1>{project.name()}</h1>
      <p>{project.conversationList().length} conversations</p>
      <button onClick={() => project.addKnowledge("Uses TailwindCSS v4.")}>
        Add knowledge
      </button>
      <For each={project.conversationList()}>
        {(conv) => <div>{conv.title} — {conv.messageCount} messages</div>}
      </For>
    </div>
  );
}
```

### TanStack Start

```tsx
import { Project } from "@aibind/tanstack-start/project";

const project = new Project({
  name: "My App",
  instructions: "You are a coding assistant for a React TypeScript app.",
  knowledge: [
    "The app uses Next.js 15 with the app router.",
    "State management is done with Zustand.",
    "The database is PostgreSQL with Drizzle ORM.",
  ],
  model: "smart",
});

function ProjectView() {
  const { name, systemPrompt, conversations } = project.useSnapshot();

  return (
    <div>
      <h1>{name}</h1>
      <p>{conversations.length} conversations</p>
      <button onClick={() => project.addKnowledge("Uses TailwindCSS v4.")}>
        Add knowledge
      </button>
      {conversations.map((conv) => (
        <div key={conv.id}>{conv.title} — {conv.messageCount} messages</div>
      ))}
    </div>
  );
}
```

### Common API (all frameworks)

```ts
// Create conversations within the project
const { id, history } = project.createConversation("Bug fix discussion");
history.append({ role: "user", content: "I have a bug in my auth flow..." });

// The system prompt includes instructions + knowledge
const systemPrompt = project.buildSystemPrompt();
// "You are a coding assistant...
//
// ## Project Knowledge
//
// The app uses Next.js 15...
// State management is done with Zustand...
// The database is PostgreSQL..."
```

## API

### Constructor

```ts
new Project(config: ProjectConfig, treeConfig?: TreeConfig)
```

| Config         | Type                      | Description        |
| -------------- | ------------------------- | ------------------ |
| `name`         | `string`                  | Project name       |
| `instructions` | `string`                  | System prompt      |
| `knowledge`    | `string[]`                | Context snippets   |
| `model`        | `string`                  | Default model key  |
| `metadata`     | `Record<string, unknown>` | Arbitrary metadata |

### Conversation Management

| Method                       | Description                                |
| ---------------------------- | ------------------------------------------ |
| `createConversation(title?)` | Create a new conversation with ChatHistory |
| `getConversation(id)`        | Get conversation by ID                     |
| `listConversations()`        | List all conversations with summaries      |
| `deleteConversation(id)`     | Delete a conversation                      |

### Knowledge Management

| Method                 | Description             |
| ---------------------- | ----------------------- |
| `addKnowledge(text)`   | Add a knowledge snippet |
| `removeKnowledge(idx)` | Remove snippet by index |

### System Prompt

`buildSystemPrompt()` assembles the full system prompt by combining `instructions` with `knowledge` under a `## Project Knowledge` heading.

### Persistence

```ts
const json = project.toJSON();
const restored = Project.fromJSON(json);
```

## Reactivity by Framework

| Framework | Access pattern | Example |
|-----------|---------------|---------|
| Svelte    | Direct property | `project.name`, `project.conversationList` |
| React     | Via hook | `const { name, conversations } = project.useSnapshot()` |
| Vue       | `.value` | `project.name.value`, `project.conversationList.value` |
| Solid     | Function call | `project.name()`, `project.conversationList()` |
