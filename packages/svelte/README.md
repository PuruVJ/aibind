# @aibind/svelte

Low-level Svelte 5 reactive classes for AI streaming. **If you're using SvelteKit, use [`@aibind/sveltekit`](https://www.npmjs.com/package/@aibind/sveltekit) instead** — it wraps this package with sensible defaults, server handlers, and remote functions.

## Install

```bash
npm install @aibind/svelte ai svelte
```

> **Using SvelteKit?** Install `@aibind/sveltekit` instead — it includes this package and adds server handlers, default endpoints, and remote functions.

## Usage

This package requires you to specify an `endpoint` for every class. For SvelteKit projects, `@aibind/sveltekit` provides defaults automatically.

```svelte
<script lang="ts">
  import { Stream } from "@aibind/svelte";

  const stream = new Stream({
    endpoint: "/my/stream/endpoint", // required
    system: "You are a helpful assistant.",
  });
</script>
```

## Entry Points

| Entry                     | Exports                                                              |
| ------------------------- | -------------------------------------------------------------------- |
| `@aibind/svelte`          | `Stream`, `StructuredStream`, `defineModels`                         |
| `@aibind/svelte/agent`    | `Agent`                                                              |
| `@aibind/svelte/markdown` | `StreamMarkdown`, `StreamParser`, `HtmlRenderer`, `MarkdownRecovery` |
| `@aibind/svelte/history`  | `ReactiveChatHistory`, `ReactiveMessageTree`                         |
| `@aibind/svelte/project`  | `Project`                                                            |

## Documentation

Full documentation: **[aibind.dev](https://aibind.dev)**

- [Streaming](https://aibind.dev/concepts/streaming)
- [Structured Output](https://aibind.dev/concepts/structured-output)
- [Chat History & Branching](https://aibind.dev/concepts/chat-history)
- [Durable Streams](https://aibind.dev/concepts/durable-streams)

## Requirements

- Svelte 5.53+
- AI SDK 6.0+

## License

MIT
