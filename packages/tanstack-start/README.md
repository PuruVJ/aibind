# @aibind/tanstack-start

AI SDK bindings for TanStack Start. React hooks, server handlers, and agents — all wired up with sensible defaults.

## Install

```bash
npm install @aibind/tanstack-start ai react
```

Peer dependencies: `react ^18 || ^19`, `ai ^6.0`.

## Quick Start

### 1. Add the API route handler

```ts
// src/routes/api/ai/$.ts
import { createStreamHandler } from "@aibind/tanstack-start/server";
import { anthropic } from "@ai-sdk/anthropic";

const handler = createStreamHandler({
  model: anthropic("claude-sonnet-4-20250514"),
});

export async function POST({ request }: { request: Request }) {
  return handler(request);
}
```

### 2. Stream in a component

```tsx
import { useState } from "react";
import { useStream } from "@aibind/tanstack-start";

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

| Import Path                       | What You Get                                       |
| --------------------------------- | -------------------------------------------------- |
| `@aibind/tanstack-start`          | `useStream`, `useStructuredStream`, `defineModels` |
| `@aibind/tanstack-start/server`   | `createStreamHandler`, `ServerAgent`               |
| `@aibind/tanstack-start/agent`    | `useAgent`                                         |
| `@aibind/tanstack-start/history`  | `ChatHistory`, `MessageTree`                       |
| `@aibind/tanstack-start/markdown` | `StreamMarkdown`                                   |
| `@aibind/tanstack-start/project`  | `Project`                                          |

## Documentation

Full documentation, API reference, and guides: **[aibind.dev](https://aibind.dev)**

- [TanStack Start Setup Guide](https://aibind.dev/frameworks/tanstack-start)
- [Streaming](https://aibind.dev/concepts/streaming)
- [Structured Output](https://aibind.dev/concepts/structured-output)
- [Chat History & Branching](https://aibind.dev/concepts/chat-history)
- [Agents](https://aibind.dev/concepts/agents)

## License

MIT
