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

| Entry                     | Exports                                                              |
| ------------------------- | -------------------------------------------------------------------- |
| `@aibind/svelte`          | `Stream`, `StructuredStream`, `defineModels`, `StreamStatus`         |
| `@aibind/svelte/agent`    | `Agent`                                                              |
| `@aibind/svelte/markdown` | `StreamMarkdown`, `StreamParser`, `HtmlRenderer`, `MarkdownRecovery` |
| `@aibind/svelte/history`  | `ReactiveChatHistory`, `ReactiveMessageTree`                         |

## Abort + Resume

`Stream` (and `StructuredStream`) support server-side abort and resume when paired with a resumable server handler. The client auto-detects SSE responses — no configuration needed.

### New reactive properties

| Property    | Type             | Description                                                                                   |
| ----------- | ---------------- | --------------------------------------------------------------------------------------------- |
| `status`    | `StreamStatus`   | `'idle' \| 'streaming' \| 'stopped' \| 'done' \| 'reconnecting' \| 'disconnected' \| 'error'` |
| `streamId`  | `string \| null` | Current stream ID (set when server uses SSE)                                                  |
| `canResume` | `boolean`        | `true` if stream was interrupted but can be manually resumed                                  |

### New methods

| Method     | Description                                                      |
| ---------- | ---------------------------------------------------------------- |
| `stop()`   | Signal the server to stop LLM generation. Keeps partial text.    |
| `resume()` | Reconnect to an interrupted stream from the last received chunk. |

### Auto-reconnect

On network drop during SSE streaming, the client automatically retries up to 3 times with exponential backoff (1s, 2s, 4s). If all retries fail, `status` becomes `'disconnected'` and `canResume` becomes `true` for manual retry.

```svelte
<script lang="ts">
  import { Stream } from '@aibind/svelte';

  const stream = new Stream({ endpoint: '/api/stream' });
</script>

<p>Status: {stream.status}</p>

{#if stream.status === 'streaming'}
  <button onclick={() => stream.stop()}>Stop</button>
{/if}

{#if stream.canResume}
  <button onclick={() => stream.resume()}>Resume</button>
{/if}
```

## Requirements

- Svelte 5.53+
- AI SDK 6.0+

## License

MIT
