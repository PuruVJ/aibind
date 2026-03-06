# Custom Routing

`createStreamHandler` handles routing automatically. When you need custom middleware, auth, or a non-standard framework, use `StreamHandler` directly.

## StreamHandler class

`StreamHandler` exposes each endpoint as a typed method. You parse the request, call the method, return the `Response`.

```ts
import { StreamHandler } from "@aibind/core";
import { models } from "./models.server";

const ai = new StreamHandler({ models });

// ai.stream(body)           → text streaming
// ai.structuredStream(body) → JSON streaming
// ai.compact(body)          → summarize + return { summary, tokensSaved }
// ai.stop(body)             → stop a durable stream
// ai.resume(url)            → resume a durable stream
// ai.handle(request)        → all-in-one routing (same as createStreamHandler)
```

## Use cases

### Auth middleware (Next.js)

```ts
// src/app/api/ai/[...path]/route.ts
import { StreamHandler } from "@aibind/nextjs/server";
import { models } from "@/lib/models.server";
import { getSession } from "@/lib/auth";

const ai = new StreamHandler({ models });

export async function POST(request: Request) {
  const session = await getSession(request);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const body = await request.json();
  const pathname = new URL(request.url).pathname;

  if (pathname.endsWith("/stream")) {
    // Inject the user's session ID automatically — no client-side ID needed
    return ai.stream({ ...body, sessionId: session.userId });
  }
  if (pathname.endsWith("/compact")) {
    return ai.compact({ ...body, sessionId: session.userId });
  }

  return new Response("Not Found", { status: 404 });
}
```

### Hono

```ts
import { Hono } from "hono";
import { StreamHandler } from "@aibind/core";
import { models } from "./models.server";

const ai = new StreamHandler({ models });
const app = new Hono();

app.post("/__aibind__/stream", async (c) => {
  return ai.stream(await c.req.json());
});

app.post("/__aibind__/structured", async (c) => {
  return ai.structuredStream(await c.req.json());
});

app.post("/__aibind__/compact", async (c) => {
  return ai.compact(await c.req.json());
});

export default app;
```

### Rate limiting

```ts
import { StreamHandler } from "@aibind/core";
import { ratelimit } from "./ratelimit";

const ai = new StreamHandler({ models });

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { success } = await ratelimit.limit(ip);
  if (!success) return new Response("Too Many Requests", { status: 429 });

  return ai.stream(await request.json());
}
```

### Per-user model access

```ts
const ai = new StreamHandler({ models });

export async function POST(request: Request) {
  const session = await getSession(request);
  const body = await request.json();

  // Restrict free users to fast model only
  const allowedModel = session?.plan === "pro" ? body.model : "fast";

  return ai.stream({ ...body, model: allowedModel });
}
```

## StreamHandler vs createStreamHandler

|                   | `createStreamHandler`   | `new StreamHandler`        |
| ----------------- | ----------------------- | -------------------------- |
| Routing           | Built-in                | You provide                |
| Middleware        | Not supported           | Full control               |
| Auth injection    | Not supported           | Modify body before calling |
| Multiple handlers | One instance per config | Share one instance         |
| Use case          | Standard setup          | Custom requirements        |

`createStreamHandler(config)` is equivalent to `new StreamHandler(config).handle` — it's a thin convenience wrapper.

## Body type reference

```ts
import type {
  StreamRequestBody,
  StructuredStreamRequestBody,
  CompactRequestBody,
  StopRequestBody,
} from "@aibind/core";
```

| Type                          | Fields                                      |
| ----------------------------- | ------------------------------------------- |
| `StreamRequestBody`           | `prompt`, `system?`, `model?`, `sessionId?` |
| `StructuredStreamRequestBody` | same as Stream + `schema?`                  |
| `CompactRequestBody`          | `messages`, `model?`, `sessionId?`          |
| `StopRequestBody`             | `id`                                        |
