# @aibind/solidstart

AI SDK bindings for SolidStart. Reactive SolidJS hooks, server handlers, and agents — all wired up with sensible defaults.

## Install

```bash
npm install @aibind/solidstart ai solid-js
```

Peer dependencies: `solid-js ^1.8`, `ai ^6.0`.

## Quick Start

### 1. Add the server handler

```ts
// src/routes/api/__aibind__/[...path].ts
import { createStreamHandler } from "@aibind/solidstart/server";
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
import { useStream } from "@aibind/solidstart";

function Chat() {
  const { text, loading, send } = useStream({
    system: "You are a helpful assistant.",
  });

  let prompt = "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send(prompt);
      }}
    >
      <input value={prompt} onInput={(e) => (prompt = e.target.value)} />
      <button disabled={loading()}>Send</button>
      <Show when={text()}>
        <p>{text()}</p>
      </Show>
    </form>
  );
}
```

## Entry Points

| Import Path                   | What You Get                                       |
| ----------------------------- | -------------------------------------------------- |
| `@aibind/solidstart`          | `useStream`, `useStructuredStream`, `defineModels` |
| `@aibind/solidstart/server`   | `createStreamHandler`, `ServerAgent`               |
| `@aibind/solidstart/agent`    | `useAgent`                                         |
| `@aibind/solidstart/history`  | `ReactiveChatHistory`, `ReactiveMessageTree`       |
| `@aibind/solidstart/markdown` | `useStreamMarkdown`                                |
| `@aibind/solidstart/project`  | `Project`                                          |

## Documentation

Full documentation, API reference, and guides: **[aibind.dev](https://aibind.dev)**

- [SolidStart Setup Guide](https://aibind.dev/frameworks/solidstart)
- [Streaming](https://aibind.dev/concepts/streaming)
- [Structured Output](https://aibind.dev/concepts/structured-output)
- [Chat History & Branching](https://aibind.dev/concepts/chat-history)
- [Agents](https://aibind.dev/concepts/agents)

## License

MIT
