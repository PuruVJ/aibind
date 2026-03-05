# SolidStart

## Install

```bash
pnpm add @aibind/solidstart ai @openrouter/ai-sdk-provider
```

## Setup

Follows the same pattern as other frameworks. See [SvelteKit](/frameworks/sveltekit) for the full walkthrough.

### API Route

```ts
// src/routes/api/__aibind__/[...path].ts
import { createStreamHandler } from "@aibind/solidstart/server";

const handle = createStreamHandler({ models });

export async function POST({ request }) {
  return handle(request);
}
```

### Client

```tsx
import { useStream } from "@aibind/solidstart";

function Chat() {
  const { text, loading, send } = useStream({ model: "fast" });

  return (
    <div>
      <button onClick={() => send("Hello!")}>Send</button>
      <p>{text()}</p>
    </div>
  );
}
```

## Reactivity Model

Uses SolidJS signals. Reactive properties are accessor functions — call them with `()`.

## Available Exports

Same export paths as other fullstack packages: `.`, `./server`, `./agent`, `./history`, `./markdown`, `./project`.
