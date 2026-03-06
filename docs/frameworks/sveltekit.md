# SvelteKit

SvelteKit is the primary framework for aibind and has the most complete integration.

## Install

```bash
pnpm add @aibind/sveltekit ai @openrouter/ai-sdk-provider
```

## Setup

### 1. Define Models

```ts
// src/models.server.ts
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { defineModels } from "@aibind/sveltekit";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export const models = defineModels({
  fast: openrouter("google/gemini-3.1-flash-lite-preview"),
  smart: openrouter("openai/gpt-5-mini"),
});

export type Models = keyof typeof models;
```

### 2. Server Handler

```ts
// src/hooks.server.ts
import { createStreamHandler } from "@aibind/sveltekit/server";
import { models } from "./models.server";

export const handle = createStreamHandler({
  models,
  resumable: true, // Enable durable streams
});
```

### 3. Streaming

```svelte
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";

  const stream = new Stream({
    model: "fast",
    system: "You are helpful.",
  });

  let prompt = $state("");
</script>

<form
  onsubmit={(e) => {
    e.preventDefault();
    stream.send(prompt);
    prompt = "";
  }}
>
  <input bind:value={prompt} />
  <button disabled={stream.loading}>Send</button>
</form>

<p>{stream.text}</p>
```

### 4. Structured Output

```svelte
<script lang="ts">
  import { StructuredStream } from "@aibind/sveltekit";
  import { z } from "zod/v4";

  const schema = z.object({
    sentiment: z.enum(["positive", "negative", "neutral"]),
    score: z.number(),
  });

  const analysis = new StructuredStream({ schema });
</script>

<button onclick={() => analysis.send("Analyze: Great product!")}>Analyze</button
>

{#if analysis.partial}
  <p>Sentiment: {analysis.partial.sentiment}</p>
  <p>Score: {analysis.partial.score}</p>
{/if}
```

## Reactivity Model

SvelteKit uses Svelte 5 runes (`$state`, `$derived`). All aibind classes expose reactive properties directly:

```svelte
<!-- Direct property access — no .value or () needed -->
<p>{stream.text}</p>
<p>{stream.loading}</p>
<p>{chat.messages.length}</p>
```

## AIRemote

`@aibind/sveltekit/remote` wraps SvelteKit's [server functions](https://svelte.dev/docs/kit/server-only-modules#Server-functions) (`query` and `command`) with type-safe AI bindings — no manual route setup needed.

```ts
// src/lib/ai.server.ts
import { AIRemote } from "@aibind/sveltekit/remote";
import { models } from "./models.server";
import { z } from "zod/v4";

const ai = new AIRemote(models.smart);

// Simple text query — returns a string
export const summarize = ai.query(
  z.object({ text: z.string() }),
  ({ text }) => `Summarize this in one sentence: ${text}`,
);

// Structured output query — returns typed data
export const classify = ai.structuredQuery({
  input: z.object({ text: z.string() }),
  output: z.object({ label: z.string(), confidence: z.number() }),
  prompt: ({ text }) => `Classify this text: ${text}`,
});

// Command — full access to model + request event for mutations
export const translate = ai.command(
  z.object({ text: z.string(), targetLang: z.string() }),
  async ({ text, targetLang }, { model }) => {
    const { generateText } = await import("ai");
    const result = await generateText({
      model,
      prompt: `Translate to ${targetLang}: ${text}`,
    });
    return result.text;
  },
);
```

Call from a component — fully type-safe, no `fetch` needed:

```svelte
<script lang="ts">
  import { summarize, classify } from "$lib/ai.server";

  let text = $state("");
  let summary = $state("");
  let label = $state("");

  async function run() {
    summary = await summarize({ text });
    const result = await classify({ text });
    label = result.label;
  }
</script>

<textarea bind:value={text}></textarea>
<button onclick={run}>Analyze</button>
<p>{summary}</p>
<p>Label: {label}</p>
```

| Method                                          | Description                                        |
| ----------------------------------------------- | -------------------------------------------------- |
| `ai.query(inputSchema, promptFn)`               | Text response — input → prompt → `string`          |
| `ai.structuredQuery({ input, output, prompt })` | Typed response — input → prompt → validated output |
| `ai.command(inputSchema, handler)`              | Mutation with full `{ model, event }` context      |

## Available Exports

| Import Path                  | What You Get                                 |
| ---------------------------- | -------------------------------------------- |
| `@aibind/sveltekit`          | `Stream`, `StructuredStream`, `defineModels` |
| `@aibind/sveltekit/server`   | `createStreamHandler`, `ServerAgent`         |
| `@aibind/sveltekit/agent`    | `useAgent`                                   |
| `@aibind/sveltekit/history`  | `ChatHistory`, `MessageTree`                 |
| `@aibind/sveltekit/markdown` | `StreamMarkdown`                             |
| `@aibind/sveltekit/project`  | `Project`                                    |
| `@aibind/sveltekit/remote`   | `AIRemote`                                   |
