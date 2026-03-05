# @aibind/react

Low-level React hooks for AI streaming. **If you're using Next.js, use [`@aibind/nextjs`](https://www.npmjs.com/package/@aibind/nextjs) instead** — it wraps this package with sensible defaults and server handlers.

## Install

```bash
npm install @aibind/react ai react
```

> **Using Next.js?** Install `@aibind/nextjs` instead — it includes this package and adds API route handlers and default endpoints.

## Usage

This package requires you to specify an `endpoint` for every hook. For Next.js projects, `@aibind/nextjs` provides defaults automatically.

```tsx
"use client";

import { useStream } from "@aibind/react";

function Chat() {
  const { text, loading, send } = useStream({
    endpoint: "/api/stream", // required
    system: "You are a helpful assistant.",
  });

  return <p>{text}</p>;
}
```

## Entry Points

| Entry                    | Exports                                            |
| ------------------------ | -------------------------------------------------- |
| `@aibind/react`          | `useStream`, `useStructuredStream`, `defineModels` |
| `@aibind/react/agent`    | `useAgent`                                         |
| `@aibind/react/markdown` | `StreamMarkdown`                                   |
| `@aibind/react/history`  | `ChatHistory`, `MessageTree`                       |
| `@aibind/react/project`  | `Project`                                          |

## Documentation

Full documentation: **[aibind.dev](https://aibind.dev)**

- [Streaming](https://aibind.dev/concepts/streaming)
- [Structured Output](https://aibind.dev/concepts/structured-output)
- [Chat History & Branching](https://aibind.dev/concepts/chat-history)

## Requirements

- React 18+ or 19+
- AI SDK 6.0+

## License

MIT
