# Installation

aibind has separate packages for each framework. Install the one that matches your stack.

## Fullstack Frameworks (Recommended)

These packages include both client hooks and server handlers with sensible defaults.

### SvelteKit

```bash
pnpm add @aibind/sveltekit ai
```

### Next.js

```bash
pnpm add @aibind/nextjs ai
```

### Nuxt

```bash
pnpm add @aibind/nuxt ai
```

### SolidStart

```bash
pnpm add @aibind/solidstart ai
```

### TanStack Start

```bash
pnpm add @aibind/tanstack-start ai
```

## Client-Only Packages

Use these if you have a custom backend or want to bring your own API endpoints.

```bash
# Svelte 5
pnpm add @aibind/svelte ai

# React
pnpm add @aibind/react ai

# Vue 3
pnpm add @aibind/vue ai

# SolidJS
pnpm add @aibind/solid ai
```

## AI Provider

aibind works with any [AI SDK provider](https://sdk.vercel.ai/providers). Here's how to set up OpenRouter (recommended for multi-model access):

```bash
pnpm add @openrouter/ai-sdk-provider
```

```ts
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});
```

## Package Architecture

```
@aibind/core          ← Framework-agnostic controllers & types
@aibind/markdown      ← Streaming markdown parser (standalone)

@aibind/svelte        ← Svelte 5 reactive wrappers
@aibind/vue           ← Vue 3 reactive wrappers
@aibind/react         ← React hooks
@aibind/solid         ← SolidJS reactive wrappers

@aibind/sveltekit     ← SvelteKit fullstack adapter
@aibind/nextjs        ← Next.js fullstack adapter
@aibind/nuxt          ← Nuxt fullstack adapter
@aibind/solidstart    ← SolidStart fullstack adapter
@aibind/tanstack-start ← TanStack Start fullstack adapter
```

The fullstack packages (`@aibind/sveltekit`, `@aibind/nextjs`, etc.) re-export everything from their client package with default endpoint configuration, plus add server-side handlers.
