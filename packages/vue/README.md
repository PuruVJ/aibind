# @aibind/vue

Low-level Vue 3 composables for AI streaming. **If you're using Nuxt, use [`@aibind/nuxt`](https://www.npmjs.com/package/@aibind/nuxt) instead** — it wraps this package with sensible defaults and server handlers.

## Install

```bash
npm install @aibind/vue ai vue
```

> **Using Nuxt?** Install `@aibind/nuxt` instead — it includes this package and adds server handlers and default endpoints.

## Usage

This package requires you to specify an `endpoint` for every composable. For Nuxt projects, `@aibind/nuxt` provides defaults automatically.

```vue
<script setup lang="ts">
import { useStream } from "@aibind/vue";

const { text, loading, send } = useStream({
  endpoint: "/my/stream/endpoint", // required
  system: "You are a helpful assistant.",
});
</script>
```

## Entry Points

| Entry                  | Exports                                                              |
| ---------------------- | -------------------------------------------------------------------- |
| `@aibind/vue`          | `useStream`, `useStructuredStream`, `defineModels`                   |
| `@aibind/vue/agent`    | `useAgent`                                                           |
| `@aibind/vue/markdown` | `StreamMarkdown`, `StreamParser`, `HtmlRenderer`, `MarkdownRecovery` |
| `@aibind/vue/history`  | `ReactiveChatHistory`, `ReactiveMessageTree`                         |
| `@aibind/vue/project`  | `Project`                                                            |

## Documentation

Full documentation: **[aibind.dev](https://aibind.dev)**

- [Streaming](https://aibind.dev/concepts/streaming)
- [Structured Output](https://aibind.dev/concepts/structured-output)
- [Chat History & Branching](https://aibind.dev/concepts/chat-history)

## Requirements

- Vue 3.3+
- AI SDK 6.0+

## License

MIT
