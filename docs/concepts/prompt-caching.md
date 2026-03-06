# Prompt Caching

One option on the server handler cuts input token costs by ~90% for repeated system prompts. Zero client changes required.

## How It Works

Anthropic's [prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) lets you mark a prefix of your prompt for server-side caching. When the same prefix appears in subsequent requests, Anthropic serves it from cache at ~10% of the normal input token cost.

The system prompt is the perfect candidate — it's long, repeated on every request, and identical across turns.

`cacheSystemPrompt: true` detects the model provider at request time and automatically adds the `cache_control` breakpoint when an Anthropic model is used. No code changes needed per-request.

## Setup

One line on the server handler:

```ts
// hooks.server.ts (SvelteKit) | app/api/ai/[...path]/route.ts (Next.js)
import { createStreamHandler } from "@aibind/sveltekit/server";

export const handle = createStreamHandler({
  models,
  cacheSystemPrompt: true, // ← that's it
});
```

Pass a system prompt from the client (or set a default on the server):

```svelte
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";

  const stream = new Stream({ model: "smart" });
</script>

<button
  onclick={() =>
    stream.send("What is the capital of France?", {
      system: "You are a helpful geography tutor. Answer concisely.",
    })}
>
  Ask
</button>
```

The first request caches the system prompt. Every subsequent request with the same system prompt costs ~90% less in input tokens.

## Requirements

- **Direct Anthropic provider** — uses `@ai-sdk/anthropic` (`anthropic(...)`) as the model, not OpenRouter or a proxy. OpenRouter doesn't forward the `cache_control` metadata.
- **System prompt present** — caching only applies when a `system` field is included in the request.
- **Anthropic model** — the handler auto-detects the provider. Non-Anthropic models are unaffected and receive no `cache_control`.

```ts
import { anthropic } from "@ai-sdk/anthropic";
import { defineModels } from "@aibind/core";

// ✅ Works — direct @ai-sdk/anthropic
const models = defineModels({
  smart: anthropic("claude-sonnet-4-6"),
});

// ❌ Won't cache — OpenRouter proxies don't forward cache_control
const models = defineModels({
  smart: openrouter("anthropic/claude-sonnet-4-6"),
});
```

## Mixing Models

You can mix Anthropic and non-Anthropic models freely. `cacheSystemPrompt` is a no-op for non-Anthropic models:

```ts
const models = defineModels({
  fast: openrouter("google/gemini-3.1-flash-lite-preview"), // unaffected
  smart: anthropic("claude-sonnet-4-6"), // cached
});

export const handle = createStreamHandler({
  models,
  cacheSystemPrompt: true,
});
```

Requests using `fast` go through normally. Requests using `smart` get the cache breakpoint added automatically.

## API Reference

### `StreamHandlerConfig`

| Option              | Type      | Default | Description                                                                                                                                       |
| ------------------- | --------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cacheSystemPrompt` | `boolean` | `false` | When `true`, adds `cache_control: { type: "ephemeral" }` to the system prompt for Anthropic models. Silently skipped for non-Anthropic providers. |
