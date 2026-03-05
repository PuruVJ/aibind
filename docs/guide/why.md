# Why aibind?

## Built on AI SDK

The [Vercel AI SDK](https://sdk.vercel.ai/) is excellent. `streamText`, `generateObject`, tool calling, provider adapters — it handles the hard parts of talking to LLMs. aibind doesn't replace any of that. It uses AI SDK under the hood for all model interactions.

What aibind adds is a **higher-level client experience** — reactive bindings, opinionated defaults, and patterns that every AI app ends up needing.

## What aibind adds

### Universal framework support

AI SDK focuses on React with `@ai-sdk/react`. aibind brings the same developer experience to every major framework, with native reactivity for each:

| Framework | What you get                                    |
| --------- | ----------------------------------------------- |
| React     | `useStream`, `useStructuredStream` hooks        |
| Vue       | `useStream`, `useStructuredStream` composables  |
| Svelte 5  | `Stream`, `StructuredStream` reactive classes   |
| SolidJS   | `useStream`, `useStructuredStream` signal hooks |
| TanStack  | Same React hooks, TanStack Start server adapter |

Every framework gets identical capabilities — streaming, structured output, agents, chat history, markdown rendering.

### Opinionated streaming

AI SDK gives you `streamText` and a readable stream. What you do with it on the client is up to you. aibind takes an opinionated approach — one class/hook that manages all the state:

```svelte
<!-- This is all you need for a streaming response -->
<script>
  import { Stream } from '@aibind/sveltekit';
  const stream = new Stream({ model: 'fast' });
</script>

<button onclick={() => stream.send('Hello')}>Send</button>
<p>{stream.text}</p>
<p>Loading: {stream.loading}</p>
<p>Done: {stream.done}</p>
```

Text, loading state, errors, abort, retry — it's all managed for you. No need to wire up `AbortController`, track streaming state, or handle reconnection logic.

### Structured output with partial streaming

AI SDK has `generateObject` for structured output. aibind adds **streaming partial objects** with type safety — you see `DeepPartial<T>` updates as JSON tokens arrive:

```ts
const analysis = new StructuredStream({
  schema: z.object({
    sentiment: z.enum(["positive", "negative"]),
    score: z.number(),
    topics: z.array(z.string()),
  }),
});

// analysis.partial.sentiment appears first
// analysis.partial.score appears next
// analysis.partial.topics fills in progressively
// analysis.data is the validated final result
```

### Chat history with branching

Claude, ChatGPT, and other AI products let you edit messages and navigate between alternative responses. Building this from a flat message array is surprisingly hard.

aibind provides `ChatHistory` backed by a tree data structure:

```ts
const m1 = chat.append({ role: "user", content: "Hello" });
const m2 = chat.append({ role: "assistant", content: "Hi!" });

// Edit creates a new branch
const m3 = chat.edit(m1, { role: "user", content: "Hey there" });

// Navigate between alternatives
chat.nextAlternative(m3); // back to original
chat.prevAlternative(m2); // back to edit
```

### Durable streams

Network drops happen. aibind's durable streams buffer chunks server-side with sequence numbers, so clients can stop generation, reconnect after drops, and resume from where they left off — no data loss.

### Streaming markdown

AI responses are usually markdown, but rendering incomplete markdown mid-stream creates visual glitches — unterminated bold, partial code blocks, broken links. aibind includes a streaming markdown parser with automatic recovery that renders cleanly at every point during the stream.

### Server handler included

aibind's fullstack packages include a server handler that routes streaming and structured requests automatically:

```ts
// One line for both /stream and /structured endpoints
export const handle = createStreamHandler({ models });
```

## Architecture

```
AI SDK (streamText, generateObject, tools)
        ↕
@aibind/core (controllers, stream utilities, data structures)
        ↕
@aibind/{svelte,react,vue,solid} (reactive framework wrappers)
        ↕
@aibind/{sveltekit,nextjs,nuxt,solidstart,tanstack-start} (fullstack adapters)
```

Each layer is independently useful:

- **Core** is framework-agnostic — use it anywhere
- **Framework packages** add reactive state management
- **Fullstack packages** add server handlers with defaults

## When to use aibind

**aibind is a good fit when:**

- You want streaming with built-in state management
- You need structured output with partial updates
- You're building a chat UI with branching history
- You want durable/resumable streams
- You're using any framework and want consistent APIs
- You want streaming markdown that renders cleanly

**Use AI SDK directly when:**

- You only need `streamText` in a Node.js script
- You have very custom streaming requirements that don't fit the opinionated model
