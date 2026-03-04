# @aibind/svelte

Low-level Svelte 5 reactive classes for AI streaming. **If you're using SvelteKit, use [`@aibind/sveltekit`](https://www.npmjs.com/package/@aibind/sveltekit) instead** — it wraps this package with sensible defaults, server handlers, and remote functions.

## Features

🤏 **Tiny** — Ships only what you use. Tree-shakes per entry point.
🐇 **Simple** — Three classes: `Stream`, `StructuredStream`, `Agent`. Instantiate and `.send()`.
🧙‍♀️ **Elegant** — Svelte 5 runes (`$state`) on every field. No stores, no boilerplate.
🗃️ **Highly customizable** — Custom endpoints, custom fetch, per-request system overrides, named model registries.
⚛️ **Reactive** — Text, loading, error, done — all reactive. Just bind and go.

## Install

```bash
npm install @aibind/svelte ai svelte
```

> **Using SvelteKit?** Install `@aibind/sveltekit` instead — it includes this package and adds server handlers, default endpoints, and remote functions.

## Usage

This package requires you to specify an `endpoint` for every class. For SvelteKit projects, `@aibind/sveltekit` provides defaults automatically.

```svelte
<script lang="ts">
  import { Stream } from '@aibind/svelte';

  const stream = new Stream({
    endpoint: '/my/stream/endpoint', // required
    system: 'You are a helpful assistant.'
  });
</script>
```

## Entry Points

| Entry | Exports |
|-------|---------|
| `@aibind/svelte` | `Stream`, `StructuredStream`, `defineModels` |
| `@aibind/svelte/agent` | `Agent` |

## Requirements

- Svelte 5.53+
- AI SDK 6.0+

## License

MIT
