---
"@aibind/core": minor
---

## Tab-switch auto-resume

`BaseStreamControllerOptions` gains an `autoResume` option. When `true`, the stream automatically suspends when the browser tab becomes hidden and resumes when the tab regains focus — powered by the existing durable stream infrastructure.

```ts
const stream = new Stream({ endpoint: "...", autoResume: true });
```

`BaseStreamController` also gains a `destroy()` method to remove the `visibilitychange` listener when the controller is no longer needed.

Requires `resumable: true` in `createStreamHandler` on the server.
