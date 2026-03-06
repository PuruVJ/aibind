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
    title: Streaming that just works
    details: Real-time text streaming in 3 lines of code. Abort, retry, stop mid-stream, and resume later — all built in.
    link: /concepts/streaming
    linkText: Learn more
  - icon: 🧠
    title: Server memory, zero effort
    details: Add sessionId and the server automatically maintains multi-turn context. Plug in Redis, Postgres, or any custom store.
    link: /concepts/conversation-store
    linkText: Learn more
  - icon: 🗜️
    title: Compact like Claude Code
    details: Replace a long conversation history with a single AI-generated summary — the same trick that freed 167k tokens in your last session.
    link: /concepts/compacting
    linkText: Learn more
  - icon: 🔀
    title: Switch models on the fly
    details: Change models per-send or persistently. Fully type-safe — TypeScript catches invalid model names at compile time.
    link: /concepts/model-switching
    linkText: Learn more
  - icon: 🌲
    title: Branching chat history
    details: Edit any message and explore alternatives. Branch, regenerate, and navigate between versions — exactly like Claude's conversation UI.
    link: /concepts/chat-history
    linkText: Learn more
  - icon: 📦
    title: Typed structured output
    details: Stream JSON with live partial updates as it arrives. Schema-validated with Zod, Valibot, or any Standard Schema library.
    link: /concepts/structured-output
    linkText: Learn more
  - icon: 🤖
    title: Tool-calling agents
    details: Server-side agents that call tools, chain results, and stream responses. Built-in human approval flow for sensitive operations.
    link: /concepts/agents
    linkText: Learn more
  - icon: 🔁
    title: Durable streams
    details: Close the browser, come back later, and pick up exactly where the stream left off. Automatic reconnection included.
    link: /concepts/durable-streams
    linkText: Learn more
  - icon: 💬
    title: Inline completions
    details: Ghost-text as-you-type completions with one class. Debounced, cancels on each keystroke, Tab to accept. Writing assistants and search boxes in minutes.
    link: /concepts/completions
    linkText: Learn more
  - icon: 🛠️
    title: Every framework, native reactivity
    details: SvelteKit runes, React hooks, Vue refs, Solid signals — each package uses the idioms your framework expects. No adapters, no wrappers.
    link: /frameworks/sveltekit
    linkText: Pick your framework
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


##Multi-turn conversations, zero client state

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


##Stream typed JSON with live partial updates

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

  const stream = new StructuredStream({ model: "fast", schema: ProductSchema });
</script>

<!-- Partial renders as tokens arrive — name shows before description is done -->
{#if stream.partial}
  <h2>{stream.partial.name ?? "…"}</h2>
  <p>${stream.partial.price ?? "…"}</p>
  <p>{stream.partial.description ?? "…"}</p>
{/if}
```


##Compact history like Claude Code

```svelte
<script lang="ts">
  import { Stream, ChatHistory } from "@aibind/sveltekit";

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


##Ghost-text completions as you type

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
<span class="ghost">{input}<span class="dim">{completion.suggestion}</span></span>
```

Debounced. Cancels automatically on each keystroke. Tab to accept, Escape to dismiss.
No timer management, no AbortController, no state juggling.


##See exactly what changed on regenerate

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


##Custom routing. Your rules.

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
