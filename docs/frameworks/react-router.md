# React Router v7

## Install

```bash
pnpm add @aibind/react-router ai @openrouter/ai-sdk-provider
```

## Setup

### 1. Define Models

```ts
// app/lib/models.server.ts
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { defineModels } from "@aibind/react-router/server";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export const models = defineModels({
  fast: openrouter("google/gemini-3.1-flash-lite-preview"),
  smart: openrouter("openai/gpt-5-mini"),
});

export type ModelKey = keyof typeof models;
```

### 2. API Route Handler

React Router v7 uses resource routes. Create a catch-all route under `__aibind__`:

```ts
// app/routes/__aibind__.$.ts
import { createStreamHandler } from "@aibind/react-router/server";
import { models } from "~/lib/models.server";

const handler = createStreamHandler({ models });

export async function action({ request }: { request: Request }) {
  return handler(request);
}
```

### 3. Client Components

```tsx
// app/routes/chat.tsx
import { useStream } from "@aibind/react-router";
import { useState } from "react";

export default function ChatPage() {
  const [prompt, setPrompt] = useState("");
  const { text, loading, send, abort } = useStream({ model: "fast" });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send(prompt);
        setPrompt("");
      }}
    >
      <input value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <button disabled={loading}>Send</button>
      {loading && (
        <button type="button" onClick={abort}>
          Stop
        </button>
      )}
      <p>{text}</p>
    </form>
  );
}
```

## Reactivity Model

React Router uses React hooks. aibind hooks return plain values that trigger re-renders via `useState`:

```tsx
const { text, loading, error } = useStream({ model: "fast" });
// text is a string, loading is a boolean — direct values
```

For history classes, call `useSnapshot()` inside components:

```tsx
const chat = new ChatHistory();

function Chat() {
  const { messages } = chat.useSnapshot(); // Subscribes to changes
}
```

## Conversation History

```ts
// app/routes/__aibind__.$.ts
import {
  createStreamHandler,
  MemoryConversationStore,
} from "@aibind/react-router/server";
import { models } from "~/lib/models.server";

const handler = createStreamHandler({
  models,
  conversation: { store: new MemoryConversationStore() },
});

export async function action({ request }: { request: Request }) {
  return handler(request);
}
```

```tsx
// app/routes/chat.tsx
import { useStream } from "@aibind/react-router";

const SESSION_ID = crypto.randomUUID();

export default function ChatPage() {
  const { text, send } = useStream({
    model: "fast",
    sessionId: SESSION_ID,
  });

  return (
    <div>
      <button onClick={() => send("Hello!")}>Send</button>
      <button onClick={() => send("What did I just say?")}>Ask again</button>
      <p>{text}</p>
    </div>
  );
}
```

## Key Differences from Next.js

- Resource routes use `action` export instead of `POST` handler
- Catch-all route file is `__aibind__.$.ts` (React Router file-based routing)
- No `"use client"` directive required — React Router handles SSR/client split differently
- `loader` / `action` pattern instead of App Router

## Available Exports

| Import Path                     | What You Get                                         |
| ------------------------------- | ---------------------------------------------------- |
| `@aibind/react-router`          | `useStream`, `useStructuredStream`                   |
| `@aibind/react-router/server`   | `createStreamHandler`, `ServerAgent`, `defineModels` |
| `@aibind/react-router/agent`    | `useAgent`                                           |
| `@aibind/react-router/history`  | `ChatHistory`, `MessageTree`                         |
| `@aibind/react-router/markdown` | `StreamMarkdown`                                     |
| `@aibind/react-router/project`  | `Project`                                            |
