# Roadmap

aibind is production-ready today for text streaming, structured output, cross-tab sync, streaming artifacts, and conversational history. The features below are on the near-term horizon.

## Stable

| Feature                                            | Status |
| -------------------------------------------------- | ------ |
| Text streaming (`Stream`, `useStream`)             | Stable |
| Structured output (`StructuredStream`)             | Stable |
| Durable streams (stop / resume)                    | Stable |
| Cross-tab sync (`StreamMirror`, `useStreamMirror`) | Stable |
| Streaming artifacts                                | Stable |
| Streaming diff                                     | Stable |
| Multi-model racing                                 | Stable |
| Inline completions                                 | Stable |
| Token tracking                                     | Stable |
| Conversation history (server-side sessions)        | Stable |
| Prompt caching                                     | Stable |
| Agent controller                                   | Stable |
| Multimodal attachments                             | Stable |

## Experimental

These are planned additions. APIs may shift before stable release.

### Tab-switch Auto-resume

When a user switches tabs mid-stream, `autoResume: true` on `Stream` / `useStream` suspends the stream cleanly (preserving server-side chunks) and resumes automatically when the tab regains focus. Zero user-visible data loss.

```ts
const stream = new Stream({ endpoint: "...", autoResume: true });
```

### Tool Call History in Chat

`chat.messages` currently shows only user and assistant turns. With tool call history enabled, intermediate tool invocations appear as `{ role: "tool" }` messages in the array — with `toolName` and `toolArgs` fields — so UIs can render a collapsible "Searched the web…" step between turns.

### Streaming TTS (`stream.speak()`)

Pipe the text stream directly into the browser's Web Speech API. Audio playback starts as the first sentence completes — no waiting for the full response. Sentence boundary detection queues utterances smoothly.

```ts
const stop = stream.speak(); // returns cleanup fn
```

### Multi-agent Composition

`ServerAgent.asTool(description)` wraps an agent as a callable AI SDK tool. Pass it into another agent's `toolsets` to build orchestrator/sub-agent pipelines in pure TypeScript — no Python, no framework.

```ts
const researcher = new ServerAgent({
  model,
  system: "Research topics thoroughly.",
});
const writer = new ServerAgent({ model, system: "Write compelling content." });

const orchestrator = new ServerAgent({
  model,
  system: "Coordinate research and writing tasks.",
  toolsets: {
    default: {
      researcher: researcher.asTool("Research a topic and return findings"),
      writer: writer.asTool("Write an article given a brief"),
    },
  },
  toolset: "default",
});

export const POST = ({ request }) => orchestrator.handle(request);
```

### `useChat` / `Chat`

A high-level conversational hook built on existing primitives. Manages the full `messages[]` array client-side, streams the assistant reply into the last message, and ships helpers for the common edit flows:

```ts
// SvelteKit
const chat = new Chat({ endpoint: "/__aibind__/chat" });
chat.send("What is the capital of France?");
// chat.messages — [{role:'user', content:...}, {role:'assistant', content:'Paris...'}]

// Next.js / React
const { messages, send, regenerate, edit } = useChat({ endpoint: "/api/chat" });
```

Server:

```ts
// Same StreamHandler — just add a /chat route:
app.post("/api/chat", (req) => handler.chat(req.json()));
```

### Voice Pipeline

End-to-end speech input → AI response → TTS playback. `useVoice` hook captures microphone audio, transcribes via Whisper, streams the AI reply, and plays back via the Web Speech API or a TTS endpoint — all in one composable.

### Rate-limit Retry / Backoff

Automatic `429` handling: configurable max retries, exponential backoff, per-model rate limits. Surfaces `stream.retrying` state so UIs can show a "retrying…" indicator without any app-level code.

### Budget Enforcement

`maxCost` option on `Stream` / `useStream`. Accumulates cost from the `tracker` and aborts the stream (calling `stop()`) when the threshold is crossed. Surfaces `stream.budgetExceeded` for UI feedback.

### Partial-Accept on Abort

When the user calls `stop()` mid-stream, `stream.text` holds whatever was generated. `stream.partialAccept()` (or `stream.commit()`) to "bless" the partial text as a complete turn in server-side conversation history, instead of discarding it.

## Moonshots

Longer-horizon ideas. No timeline commitments.

### aibind Observe

OpenTelemetry-compatible spans for every stream, agent call, and tool invocation. Export to Langfuse, Jaeger, or a hosted dashboard. Every `send()`, tool call, and retry gets a structured span with model, tokens, cost, and latency — making aibind the first browser AI library that's actually observable in production.

### LangGraph-style State Machine Agents

Replace `stopWhen: stepCountIs(n)` with an explicit state graph: `{ start → search → summarize → done }` with conditional edges. Agents become auditable, checkpointable, and pauseable at specific nodes. Human-in-the-loop hooks at any node, not just at tool boundaries.

### Offline-first / PWA mode

Queue `send()` calls while offline (IndexedDB), replay on reconnect in order, reconcile with server history. Every AI app drops your message if you lose WiFi for 2 seconds. No one solves this. aibind could.

### aibind Cloud

Managed persistence for `ConversationStore`, `StreamStore`, and usage data. Plug in 3 lines, get a hosted Redis-backed store, usage dashboard, and spend alerts. The `MemoryConversationStore` interface is already defined — this is its hosted form.
