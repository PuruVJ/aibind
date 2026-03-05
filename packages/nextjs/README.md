# @aibind/nextjs

AI SDK bindings for Next.js. React hooks, API route handlers, and agents — all wired up with sensible defaults.

## Install

```bash
npm install @aibind/nextjs ai react
```

Peer dependencies: `react ^18 || ^19`, `ai ^6.0`.

## Quick Start

### 1. Add the API route handler

```ts
// src/app/api/ai/[...path]/route.ts
import { createStreamHandler } from "@aibind/nextjs/server";
import { anthropic } from "@ai-sdk/anthropic";

const handler = createStreamHandler({
  model: anthropic("claude-sonnet-4-20250514"),
});

export async function POST(request: Request) {
  return handler(request);
}
```

### 2. Stream in a component

```tsx
"use client";

import { useState } from "react";
import { useStream } from "@aibind/nextjs";

export default function Chat() {
  const [prompt, setPrompt] = useState("");
  const { text, loading, send } = useStream({
    system: "You are a helpful assistant.",
  });

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
      <p>{text}</p>
    </form>
  );
}
```

## Entry Points

| Import Path               | What You Get                                       |
| ------------------------- | -------------------------------------------------- |
| `@aibind/nextjs`          | `useStream`, `useStructuredStream`, `defineModels` |
| `@aibind/nextjs/server`   | `createStreamHandler`, `ServerAgent`               |
| `@aibind/nextjs/agent`    | `useAgent`                                         |
| `@aibind/nextjs/history`  | `ChatHistory`, `MessageTree`                       |
| `@aibind/nextjs/markdown` | `StreamMarkdown`                                   |
| `@aibind/nextjs/project`  | `Project`                                          |

## Documentation

Full documentation, API reference, and guides: **[aibind.dev](https://aibind.dev)**

- [Next.js Setup Guide](https://aibind.dev/frameworks/nextjs)
- [Streaming](https://aibind.dev/concepts/streaming)
- [Structured Output](https://aibind.dev/concepts/structured-output)
- [Chat History & Branching](https://aibind.dev/concepts/chat-history)
- [Agents](https://aibind.dev/concepts/agents)

## License

MIT
