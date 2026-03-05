# Next.js

## Install

```bash
pnpm add @aibind/nextjs ai @openrouter/ai-sdk-provider
```

## Setup

### 1. Define Models

```ts
// src/lib/models.server.ts
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { defineModels } from "@aibind/nextjs";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export const models = defineModels({
  fast: openrouter("google/gemini-3.1-flash-lite-preview"),
  smart: openrouter("openai/gpt-5-mini"),
});
```

### 2. API Route Handler

```ts
// src/app/api/ai/[...path]/route.ts
import { createStreamHandler } from "@aibind/nextjs/server";
import { models } from "@/lib/models.server";

const handler = createStreamHandler({ models });

export async function POST(request: Request) {
  return handler(request);
}
```

### 3. Client Components

```tsx
// src/app/stream/page.tsx
"use client";

import { useState } from "react";
import { useStream } from "@aibind/nextjs";

export default function StreamPage() {
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
      {loading && <button onClick={abort}>Stop</button>}
      <p>{text}</p>
    </form>
  );
}
```

## Reactivity Model

Next.js uses React hooks. aibind hooks return plain values that trigger re-renders via `useState`:

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

## Key Differences from SvelteKit

- Client components must have `"use client"` directive
- API routes use catch-all `[...path]/route.ts` pattern
- No `hooks.server.ts` — use API routes instead
- History classes use `useSnapshot()` hook instead of direct property access

## Available Exports

| Import Path               | What You Get                                       |
| ------------------------- | -------------------------------------------------- |
| `@aibind/nextjs`          | `useStream`, `useStructuredStream`, `defineModels` |
| `@aibind/nextjs/server`   | `createStreamHandler`, `ServerAgent`               |
| `@aibind/nextjs/agent`    | `useAgent`                                         |
| `@aibind/nextjs/history`  | `ChatHistory`, `MessageTree`                       |
| `@aibind/nextjs/markdown` | `StreamMarkdown`                                   |
| `@aibind/nextjs/project`  | `Project`                                          |
