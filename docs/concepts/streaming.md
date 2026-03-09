# Streaming

aibind's streaming API sends a prompt to your server and streams back text in real-time.

## How It Works

1. Client sends a `POST` to your endpoint with `{ prompt, model?, system? }`
2. Server resolves the model and calls `streamText()` from the AI SDK
3. Response streams back as raw text chunks
4. Client accumulates text and updates reactive state

## Client API

Each framework has its own reactive wrapper, but the returned API surface is the same.

::: code-group

```svelte [SvelteKit]
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";

  const stream = new Stream({
    model: "fast",
    system: "You are a helpful assistant.",
  });
</script>

<button onclick={() => stream.send("Hello!")}>Send</button>
<p>{stream.text}</p>
<p>Loading: {stream.loading}, Done: {stream.done}</p>
```

```tsx [Next.js]
"use client";

import { useStream } from "@aibind/nextjs";

function Chat() {
  const { text, loading, send, abort, retry } = useStream({
    model: "fast",
    system: "You are a helpful assistant.",
  });

  return (
    <div>
      <button onClick={() => send("Hello!")}>Send</button>
      <p>{text}</p>
    </div>
  );
}
```

```vue [Nuxt]
<script setup lang="ts">
import { useStream } from "@aibind/nuxt";

const { text, loading, send, abort, retry } = useStream({
  model: "fast",
  system: "You are a helpful assistant.",
});
</script>

<template>
  <button @click="send('Hello!')">Send</button>
  <p>{{ text }}</p>
  <p>Loading: {{ loading }}, Done: {{ done }}</p>
</template>
```

```tsx [SolidStart]
import { useStream } from "@aibind/solidstart";

function Chat() {
  const { text, loading, send, abort, retry } = useStream({
    model: "fast",
    system: "You are a helpful assistant.",
  });

  return (
    <div>
      <button onClick={() => send("Hello!")}>Send</button>
      <p>{text()}</p>
      <p>
        Loading: {loading()}, Done: {done()}
      </p>
    </div>
  );
}
```

```tsx [TanStack Start]
import { useStream } from "@aibind/tanstack-start";

function Chat() {
  const { text, loading, send, abort, retry } = useStream({
    model: "fast",
    system: "You are a helpful assistant.",
  });

  return (
    <div>
      <button onClick={() => send("Hello!")}>Send</button>
      <p>{text}</p>
    </div>
  );
}
```

:::

## Returned State

| Property    | Type             | Description                                        |
| ----------- | ---------------- | -------------------------------------------------- |
| `text`      | `string`         | Accumulated streamed text                          |
| `loading`   | `boolean`        | Whether a stream is in progress                    |
| `done`      | `boolean`        | Whether the stream finished                        |
| `error`     | `Error \| null`  | Any error that occurred                            |
| `status`    | `StreamStatus`   | `'idle' \| 'streaming' \| 'stopped' \| 'resuming'` |
| `streamId`  | `string \| null` | ID for durable stream operations                   |
| `canResume` | `boolean`        | Whether the stream supports resume                 |
| `model`     | `M \| undefined` | Current persistent model                           |
| `setModel`  | `(m: M) => void` | Change persistent model for all future sends       |

## Methods

| Method                | Description                                             |
| --------------------- | ------------------------------------------------------- |
| `send(prompt, opts?)` | Start streaming with the given prompt                   |
| `abort()`             | Cancel the current stream                               |
| `retry()`             | Re-send the last prompt                                 |
| `stop()`              | Stop and save stream for later resume                   |
| `resume()`            | Resume a stopped stream                                 |
| `speak()`             | Pipe stream to Web Speech API; returns cleanup function |
| `broadcast(name)`     | Sync stream state to other tabs via BroadcastChannel    |
| `destroy()`           | Remove event listeners (call when controller is done)   |

## Options

| Option        | Type                     | Description                                                          |
| ------------- | ------------------------ | -------------------------------------------------------------------- |
| `model`       | `string`                 | Named model key (from `defineModels`)                                |
| `system`      | `string`                 | System prompt                                                        |
| `endpoint`    | `string`                 | Custom endpoint (fullstack packages default to `/__aibind__/stream`) |
| `fetch`       | `typeof fetch`           | Custom fetch function                                                |
| `onFinish`    | `(text: string) => void` | Called when stream completes                                         |
| `onError`     | `(error: Error) => void` | Called on error                                                      |
| `sessionId`   | `string`                 | Enable server-side conversation history (see [Conversation Store])   |
| `autoResume`  | `boolean`                | Auto-suspend on tab hide, auto-resume on tab focus (requires durable streams) |

## `stream.speak()`

Pipe the streaming response into the browser's [`SpeechSynthesis`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis) API. Audio playback starts after the first complete sentence — no waiting for the full response to finish. Returns a cleanup function.

```ts
const stream = new Stream({ endpoint: "..." });
const stopSpeaking = stream.speak();

stream.send("Explain the water cycle");
// sentences play back as they arrive

stopSpeaking(); // cancel at any time
```

No-op in non-browser environments. Zero dependencies — uses `window.speechSynthesis`.

## Tab-switch Auto-resume

Set `autoResume: true` to automatically suspend the stream when the tab becomes hidden and resume when it regains focus — backed by the existing durable stream infrastructure.

```ts
const stream = new Stream({ endpoint: "...", autoResume: true });
```

Requires `resumable: true` on the server handler. Call `stream.destroy()` when the controller is no longer needed to remove the `visibilitychange` listener.

[Conversation Store]: /concepts/conversation-store

## Reactivity by Framework

The API is identical — only the access pattern differs:

| Framework | Access pattern  | Example            |
| --------- | --------------- | ------------------ |
| Svelte    | Direct property | `stream.text`      |
| React     | Direct value    | `text` (from hook) |
| Vue       | `.value`        | `text.value`       |
| Solid     | Function call   | `text()`           |

## Server Handler

The server handler is created once and handles all routing:

```ts
import { createStreamHandler } from "@aibind/sveltekit/server";
import { models } from "./models.server";

export const handle = createStreamHandler({ models });
```

It automatically routes `/__aibind__/stream` and `/__aibind__/structured` requests.
