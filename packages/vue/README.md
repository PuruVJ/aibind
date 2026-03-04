# @aibind/vue

Low-level Vue 3 composables for AI streaming. **If you're using Nuxt, use [`@aibind/nuxt`](https://www.npmjs.com/package/@aibind/nuxt) instead** — it wraps this package with sensible defaults and server handlers.

## Features

🤏 **Tiny** — Ships only what you use. Tree-shakes per entry point.
🐇 **Simple** — Three composables: `useStream`, `useStructuredStream`, `useAgent`. Call in `setup()` and go.
🧙‍♀️ **Elegant** — Returns plain `Ref<T>` values. Use in templates or destructure freely.
🗃️ **Highly customizable** — Custom endpoints, custom fetch, per-request system overrides, named model registries.
⚛️ **Reactive** — Every piece of state is a Vue `ref`. Reactivity works exactly as you'd expect.

## Install

```bash
npm install @aibind/vue ai vue
```

> **Using Nuxt?** Install `@aibind/nuxt` instead — it includes this package and adds server handlers and default endpoints.

## Usage

This package requires you to specify an `endpoint` for every composable. For Nuxt projects, `@aibind/nuxt` provides defaults automatically.

```vue
<script setup lang="ts">
import { useStream } from '@aibind/vue';

const { text, loading, send } = useStream({
  endpoint: '/my/stream/endpoint', // required
  system: 'You are a helpful assistant.'
});
</script>
```

## Entry Points

| Entry | Exports |
|-------|---------|
| `@aibind/vue` | `useStream`, `useStructuredStream`, `defineModels` |
| `@aibind/vue/agent` | `useAgent` |

## Requirements

- Vue 3.3+
- AI SDK 6.0+

## License

MIT
