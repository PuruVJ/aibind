# Projects

Projects let you manage multiple conversations that share a common context — like Claude's Projects feature. Each project has instructions (system prompt), knowledge snippets, and a set of conversations.

## Basic Usage

```ts
import { Project } from "@aibind/sveltekit/project";

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

## Reactive Properties (Framework-specific)

### Svelte

```svelte
<p>{project.name}</p>
<p>{project.systemPrompt}</p>
<p>{project.conversationList.length} conversations</p>
```

### React

```tsx
const { name, systemPrompt, conversations } = project.useSnapshot();
```

### Vue

```vue
<p>{{ project.name.value }}</p>
<p>{{ project.conversationList.value.length }} conversations</p>
```

### Solid

```tsx
<p>{project.name()}</p>
<p>{project.conversationList().length} conversations</p>
```
