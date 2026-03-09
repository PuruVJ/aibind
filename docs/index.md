---
layout: home
hero:
  name: aibind
  text: Ship AI features in minutes, not days.
  tagline: Production-ready streaming, agents, and chat history for SvelteKit, Next.js, Nuxt, SolidStart, and more — all from one library.
  actions:
    - theme: brand
      text: Get Started →
      link: /guide/getting-started
    - theme: alt
      text: Why aibind?
      link: /guide/why
features:
  - icon: ⚡️
    title: Streaming that actually works
    details: text, loading, error — all reactive. Abort on unmount, retry on error, SSE under the hood. None of that is your problem.
    link: /concepts/streaming
    linkText: Learn more
  - icon: 🧠
    title: Server-side conversation memory
    details: Add a sessionId. The server stores the full history. Client sends only the new message. Redis, Postgres, SQLite, or in-memory.
    link: /concepts/conversation-store
    linkText: Learn more
  - icon: 🗜
    title: History compaction
    details: Summarizes a long conversation into one dense paragraph server-side. Model keeps context, you lose the dead tokens. One call.
    link: /concepts/compacting
    linkText: Learn more
  - icon: 🔀
    title: Type-safe model switching
    details: TypeScript catches invalid model names at compile time. Switch per-send or set a default. Define a router function for automatic selection.
    link: /concepts/model-switching
    linkText: Learn more
  - icon: 🌲
    title: Branching chat history
    details: Edit a message and it branches — the original is preserved. Navigate between alternatives. Same structure Claude and ChatGPT use.
    link: /concepts/chat-history
    linkText: Learn more
  - icon: 📦
    title: Structured output that streams
    details: Parses incomplete JSON as it arrives. Partial fields render before the response is done. Validated with Zod, Valibot, or any Standard Schema.
    link: /concepts/structured-output
    linkText: Learn more
  - icon: 🤖
    title: Tool-calling agents
    details: Server-side multi-step tool loops. Define tools once, model chains them. Built on AI SDK's streamText with configurable stop conditions.
    link: /concepts/agents
    linkText: Learn more
  - icon: 🔁
    title: Resumable streams
    details: Chunks are buffered server-side. Tab reload, network drop, navigating away — client reconnects and picks up exactly where it left off.
    link: /concepts/durable-streams
    linkText: Learn more
  - icon: 💬
    title: Inline ghost-text completions
    details: Debounced, auto-cancels on keystroke, Tab to accept. One class. No AbortController, no timers, no state juggling.
    link: /concepts/completions
    linkText: Learn more
  - icon: 🛠
    title: Native reactivity per framework
    details: Svelte runes, React hooks, Vue refs, Solid signals. Each package uses what your framework expects — no generic observables.
    link: /frameworks/sveltekit
    linkText: Pick your framework
  - icon: ✍
    title: Streaming markdown
    details: Renders partial markdown without flicker. Recovers unterminated bold, broken fences, and split links in real time. 1M ops/s, zero deps.
    link: /concepts/markdown
    linkText: Learn more
  - icon: 🏁
    title: Model racing
    details: Send to multiple models at once. First to respond streams live, the rest are cancelled. Configure first-token or first-complete strategy.
    link: /concepts/model-racing
    linkText: Learn more
  - icon: 🪙
    title: Token and cost tracking
    details: Attach a tracker to any stream. Accumulates tokens and USD cost across every turn and model. All properties reactive.
    link: /concepts/token-tracking
    linkText: Learn more
  - icon: 🔍
    title: Word-level diff on regenerate
    details: Pass a diff function once. Every regeneration produces typed add/remove/equal chunks. Bring your own diff library or use the built-in.
    link: /concepts/streaming-diff
    linkText: Learn more
  - icon: 💸
    title: Prompt caching
    details: One flag adds Anthropic cache_control to system prompts server-side, auto-detected per request. ~90% off repeated input tokens.
    link: /concepts/prompt-caching
    linkText: Learn more
  - icon: 🧱
    title: Service Worker backend
    details: Run the full AI stack in a SW — no server needed. LLM calls from the browser, stream chunks and history in IndexedDB. Ship to GitHub Pages.
    link: /integrations/service-worker
    linkText: Learn more
---

<div class="home-content">

## Get streaming in 30 seconds

::: code-group

```svelte [SvelteKit]
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";

  const stream = new Stream({ model: "fast" });
</script>

<button onclick={() => stream.send("Hello!")}>Send</button><p>{stream.text}</p>
```

```tsx [Next.js]
"use client";
import { useStream } from "@aibind/nextjs";

export default function Chat() {
  const { text, send } = useStream({ model: "fast" });
  return <button onClick={() => send("Hello!")}>{text || "Send"}</button>;
}
```

```vue [Nuxt]
<script setup lang="ts">
import { useStream } from "@aibind/nuxt";
const { text, send } = useStream({ model: "fast" });
</script>

<template>
  <button @click="send('Hello!')">Send</button>
  <p>{{ text }}</p>
</template>
```

```tsx [SolidStart]
import { useStream } from "@aibind/solidstart";

export default function Chat() {
  const { text, send } = useStream({ model: "fast" });
  return <button onClick={() => send("Hello!")}>{text() || "Send"}</button>;
}
```

:::

One function call. Your framework's native reactivity. That's the whole API.

## One server handler routes everything

```ts
// hooks.server.ts (SvelteKit) | app/api/ai/[...path]/route.ts (Next.js)
import { createStreamHandler } from "@aibind/sveltekit/server";
import { defineModels } from "@aibind/core";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

const models = defineModels({
  fast: openrouter("google/gemini-3.1-flash-lite-preview"),
  smart: openrouter("anthropic/claude-sonnet-4-6"),
  reason: openrouter("google/gemini-2.5-pro"),
});

export const handle = createStreamHandler({ models });
// ↑ Routes /stream, /structured, /compact — done.
```

## Multi-turn conversations, zero client state

```ts
// Server: one line enables memory
const handler = createStreamHandler({
  models,
  conversation: { store: new MemoryConversationStore() },
});
```

```svelte
<!-- Client: one field enables it -->
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";

  const stream = new Stream({
    model: "fast",
    sessionId: crypto.randomUUID(), // server remembers the rest
  });
</script>

<button onclick={() => stream.send("What did I just say?")}>Ask</button>
<p>{stream.text}</p>
<!-- Server has the full history. Client sends only the new message. -->
```

## Stream typed JSON with live partial updates

```ts
import { z } from "zod";

const ProductSchema = z.object({
  name: z.string(),
  price: z.number(),
  description: z.string(),
  tags: z.array(z.string()),
});
```

```svelte
<script lang="ts">
  import { StructuredStream } from "@aibind/sveltekit";
  import { ProductSchema } from "$lib/schemas";

  const stream = new StructuredStream({
    model: "fast",
    endpoint: "/__aibind__/structured",
    schema: ProductSchema,
  });
</script>

<!-- Partial renders as tokens arrive — name shows before description is done -->
{#if stream.partial}
  <h2>{stream.partial.name ?? "…"}</h2>
  <p>${stream.partial.price ?? "…"}</p>
  <p>{stream.partial.description ?? "…"}</p>
{/if}
```

## Compact history like Claude Code

```svelte
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";
  import { ChatHistory } from "@aibind/core";

  const chat = new ChatHistory();
  const stream = new Stream({ model: "smart", sessionId: crypto.randomUUID() });
</script>

<button
  onclick={async () => {
    const { tokensSaved } = await stream.compact(chat);
    // History replaced with AI summary on both client and server
    console.log(`${tokensSaved.toLocaleString()} tokens freed`);
  }}
>
  Compact history
</button>
```

## Ghost-text completions as you type

Chat is the wrong shape for writing assistants, search boxes, and code inputs. `Completion` is built for that:

```svelte
<script lang="ts">
  import { Completion } from "@aibind/sveltekit";

  const completion = new Completion({ model: "fast" });
  let input = $state("");
</script>

<input
  bind:value={input}
  oninput={() => completion.update(input)}
  onkeydown={(e) => {
    if (e.key === "Tab" && completion.suggestion) {
      input = completion.accept(); // input + ghost text
      e.preventDefault();
    }
  }}
/>
<!-- Ghost text: input value + dimmed continuation -->
<span class="ghost"
  >{input}<span class="dim">{completion.suggestion}</span></span
>
```

Debounced. Cancels automatically on each keystroke. Tab to accept, Escape to dismiss.
No timer management, no AbortController, no state juggling.

## See exactly what changed on regenerate

Pass `diff: defaultDiff` once and every regenerate emits a word-level diff — no extra code per send:

```svelte
<script lang="ts">
  import { Stream, defaultDiff } from "@aibind/sveltekit";

  const stream = new Stream({ model: "smart", diff: defaultDiff });
</script>

{#if stream.diff}
  {#each stream.diff as chunk}
    {#if chunk.type === "add"}
      <ins>{chunk.text}</ins>
    {:else if chunk.type === "remove"}
      <del>{chunk.text}</del>
    {:else}
      <span>{chunk.text}</span>
    {/if}
  {/each}
{:else}
  {stream.text}
{/if}
```

Bring your own diff library — `diff`, `fast-diff`, `diff-match-patch` — with a one-liner adapter. The built-in `defaultDiff` is a zero-dependency LCS word diff.

## Render markdown without the flash

`<StreamMarkdown>` recovers unterminated syntax mid-stream — no bold flicker, no broken code blocks, no split links:

```svelte
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";
  import { StreamMarkdown } from "@aibind/svelte/markdown";

  const stream = new Stream({ model: "smart" });
</script>

<button onclick={() => stream.send("Explain async/await")}>Ask</button>
<StreamMarkdown text={stream.text} streaming={stream.loading} />
```

Zero dependencies. 1M ops/s parser. Works with any framework via the raw `StreamParser` + `HtmlRenderer` from `@aibind/markdown`.

## Track tokens and cost across turns

```svelte
<script lang="ts">
  import { Stream, UsageTracker } from "@aibind/sveltekit";

  const tracker = new UsageTracker({
    pricing: {
      fast: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
      smart: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
    },
  });
  const stream = new Stream({ model: "fast", tracker });
</script>

<p>
  {tracker.inputTokens + tracker.outputTokens} tokens — ${tracker.cost.toFixed(
    4,
  )}
</p>
```

Accumulates across every send. Reactive. Pass the same tracker to multiple streams.

## Route models automatically by prompt

```svelte
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";
  import { routeByLength } from "@aibind/core";

  const stream = new Stream({
    routeModel: routeByLength(
      [
        { maxLength: 200, model: "fast" },
        { maxLength: 800, model: "smart" },
      ],
      "reason",
    ),
  });
</script>

<!-- Short prompt → fast, long analysis → reason. Zero per-send logic. -->
<button onclick={() => stream.send(prompt)}>Send</button>
```

Async routers work too — check user tier, A/B flags, anything. Explicit `model` on `send()` always overrides.

## Race models. Use the fastest.

```svelte
<script lang="ts">
  import { Race } from "@aibind/sveltekit";

  const race = new Race({
    models: ["fast", "smart"],
    endpoint: "/__aibind__/stream",
    strategy: "first-token", // stream whoever responds first
  });
</script>

<button onclick={() => race.send("Summarize this doc")}>Race</button>
{#if race.winner}<small>won by {race.winner}</small>{/if}
<p>{race.text}</p>
```

Both models start simultaneously. `"first-token"` streams the winner live; `"complete"` waits for whoever finishes first. Losers are cancelled automatically.

## Custom routing. Your rules.

```ts
// Need auth, rate limiting, or a custom framework? Use StreamHandler directly.
import { StreamHandler } from "@aibind/core";

const ai = new StreamHandler({ models });

// Hono
app.post("/__aibind__/stream", (c) => ai.stream(c.req.json()));

// Next.js with auth injection — session ID comes from server, not client
export async function POST(request: Request) {
  const session = await getSession(request);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const body = await request.json();
  return ai.stream({ ...body, sessionId: session.userId });
}
```

</div>

<style>
.home-content {
  max-width: 900px;
  margin: 0 auto;
  padding: 48px 24px 80px;
}

.home-content h2 {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 56px 0 20px;
  letter-spacing: -0.02em;
  border-bottom: none;
}

.home-content h2:first-child {
  margin-top: 0;
}

.home-content p {
  color: var(--vp-c-text-2);
  margin: 12px 0 0;
  font-size: 1rem;
}

.home-content hr {
  border: none;
  border-top: 1px solid var(--vp-c-divider);
  margin: 56px 0 0;
}
</style>
