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

## Experimental

These are planned additions. APIs may shift before stable release.

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

### Multimodal File Attachments

`stream.attach(file)` to include images and documents in the next `send()`. Handles base64 encoding, provider-specific payload shaping, and exposes `stream.attachments[]` for preview UIs.

### Streaming TTS

`stream.speak()` — pipe the text stream directly to a TTS endpoint chunk-by-chunk so audio starts playing before the full response arrives, without waiting for the complete transcript.

### Budget Enforcement

`maxCost` option on `Stream` / `useStream`. Accumulates cost from the `tracker` and aborts the stream (calling `stop()`) when the threshold is crossed. Surfaces `stream.budgetExceeded` for UI feedback.

### Partial-Accept on Abort

When the user calls `stop()` mid-stream, `stream.text` holds whatever was generated. `stream.partialAccept()` (or `stream.commit()`) to "bless" the partial text as a complete turn in server-side conversation history, instead of discarding it.
