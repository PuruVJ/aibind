# @aibind/sveltekit

AI SDK bindings for SvelteKit. Reactive Svelte 5 classes, server handlers, remote functions, and agents — all wired up with sensible defaults.

## Install

```bash
npm install @aibind/sveltekit ai svelte
```

Peer dependencies: `svelte ^5.53`, `ai ^6.0`, `@sveltejs/kit ^2.53`.

## Quick Start

### 1. Add the stream handler

```ts
// src/hooks.server.ts
import { createStreamHandler } from "@aibind/sveltekit/server";
import { anthropic } from "@ai-sdk/anthropic";

export const handle = createStreamHandler({
  model: anthropic("claude-sonnet-4-20250514"),
});
```

### 2. Stream in a component

```svelte
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";

  const stream = new Stream({
    system: "You are a helpful assistant.",
  });

  let prompt = $state("");
</script>

<form
  onsubmit={(e) => {
    e.preventDefault();
    stream.send(prompt);
  }}
>
  <input bind:value={prompt} />
  <button disabled={stream.loading}>Send</button>
</form>

{#if stream.text}
  <p>{stream.text}</p>
{/if}
```

## Entry Points

| Import Path                  | What You Get                                 |
| ---------------------------- | -------------------------------------------- |
| `@aibind/sveltekit`          | `Stream`, `StructuredStream`, `defineModels` |
| `@aibind/sveltekit/server`   | `createStreamHandler`, `ServerAgent`         |
| `@aibind/sveltekit/agent`    | `Agent`                                      |
| `@aibind/sveltekit/remote`   | `AIRemote`                                   |
| `@aibind/sveltekit/history`  | `ReactiveChatHistory`, `ReactiveMessageTree` |
| `@aibind/sveltekit/markdown` | `StreamMarkdown`                             |
| `@aibind/sveltekit/project`  | `Project`                                    |

## Documentation

Full documentation, API reference, and guides: **[aibind.dev](https://aibind.dev)**

- [SvelteKit Setup Guide](https://aibind.dev/frameworks/sveltekit)
- [Streaming](https://aibind.dev/concepts/streaming)
- [Structured Output](https://aibind.dev/concepts/structured-output)
- [Chat History & Branching](https://aibind.dev/concepts/chat-history)
- [Agents](https://aibind.dev/concepts/agents)
- [Durable Streams](https://aibind.dev/concepts/durable-streams)
- [Markdown Rendering](https://aibind.dev/concepts/markdown)

## License

MIT
