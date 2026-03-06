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

Building streaming UI from scratch means wiring `AbortController`, tracking loading/done/error state, handling reconnection after network drops, and keeping it all in sync with your component lifecycle. That's several hundred lines before you write a single product feature.

aibind collapses it to one class/hook:

```svelte
<script>
  import { Stream } from "@aibind/sveltekit";
  const stream = new Stream({ model: "fast" });
</script>

<button onclick={() => stream.send("Hello")}>Send</button>
<p>{stream.text}</p>
<p>Loading: {stream.loading}</p>
<p>Done: {stream.done}</p>
```

Text, loading state, errors, abort, retry — all managed. No boilerplate.

### Structured output with partial streaming

Waiting for a full JSON response before rendering anything makes the UI feel slow and unresponsive. aibind streams partial objects as JSON tokens arrive — users see results building in real time:

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

Flat message arrays break the moment users want to edit a message or see alternative responses. Building edit + regenerate + "show alternatives 2/4" from scratch requires a tree, index tracking, and careful state management.

aibind provides `ChatHistory` backed by a tree data structure:

```ts
const m1 = chat.append({ role: "user", content: "Hello" });
const m2 = chat.append({ role: "assistant", content: "Hi!" });

// Edit creates a new branch — original is preserved
const m3 = chat.edit(m1, { role: "user", content: "Hey there" });

// Navigate between alternatives
chat.nextAlternative(m3); // back to original
chat.prevAlternative(m2); // back to edit
```

### Conversation store

Most AI apps need server-side memory — so the model sees previous messages without the client resending them every time. Setting this up properly means implementing session management, serialization, and history trimming.

aibind's `ConversationStore` handles it in one config option:

```ts
export const handle = createStreamHandler({
  models,
  conversation: {
    store: new MemoryConversationStore(),
    maxMessages: 20, // sliding window
  },
});
```

On the client, pass `sessionId` once — all subsequent sends carry context automatically.

### Context compaction

Long conversations fill up the context window and drive up costs. The common workaround — summarizing the history and replacing it — requires a manual fetch, JSON parsing, and syncing both client and server state.

aibind makes it one call:

```ts
const { tokensSaved } = await stream.compact(chat);
// History replaced with AI-generated summary on both client and server
```

### Durable streams

Network drops happen. Without special handling, the user loses whatever the model was generating. aibind's durable streams buffer chunks server-side with sequence numbers, so clients can stop generation, reconnect after drops, and resume from exactly where they left off — no data loss.

### Streaming markdown

AI responses are almost always markdown, but rendering incomplete markdown mid-stream causes visual glitches — unterminated bold, partial code blocks, broken links. aibind includes a streaming markdown parser with automatic recovery that renders cleanly at every point during the stream.

### Server handler included

aibind's fullstack packages include a server handler that routes streaming, structured, and compact requests automatically:

```ts
// One line covers /stream, /structured, and /compact
export const handle = createStreamHandler({ models });
```

### Model switching

Different tasks need different models — a fast cheap model for autocomplete, a powerful model for reasoning. Switching models at runtime is built in:

```ts
const stream = new Stream<ModelKey>({ model: "fast" });

// Switch for all future sends
stream.model = "smart";

// Or override for just one request
stream.send("Reason through this carefully", { model: "reason" });
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

- You're building a chat UI and don't want to write streaming state management from scratch
- You need structured output with partial updates while the model is still generating
- You want edit/regenerate/branch on messages like ChatGPT or Claude
- Your conversations need server-side memory across turns
- You need to compact long conversations without writing the plumbing yourself
- You want durable/resumable streams that survive network drops
- You're using any framework other than React and want first-class support
- You want streaming markdown that doesn't glitch mid-stream

**Use AI SDK directly when:**

- You only need `streamText` in a Node.js script
- You have very custom streaming requirements that don't fit the opinionated model
