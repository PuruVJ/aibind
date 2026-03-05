# TanStack Start

## Install

```bash
pnpm add @aibind/tanstack-start ai @openrouter/ai-sdk-provider
```

## Setup

Follows the same pattern as Next.js (both use React). See [Next.js](/frameworks/nextjs) for the full walkthrough.

### API Route

```ts
// src/routes/api/ai/$.ts
import { createStreamHandler } from "@aibind/tanstack-start/server";

const handle = createStreamHandler({ models });

export async function POST({ request }) {
  return handle(request);
}
```

### Client

```tsx
import { useStream } from "@aibind/tanstack-start";

function Chat() {
  const { text, loading, send } = useStream({ model: "fast" });

  return (
    <div>
      <button onClick={() => send("Hello!")}>Send</button>
      <p>{text}</p>
    </div>
  );
}
```

## Reactivity Model

Same as Next.js — React hooks with direct values.

## Available Exports

Same export paths as other fullstack packages: `.`, `./server`, `./agent`, `./history`, `./markdown`, `./project`.
