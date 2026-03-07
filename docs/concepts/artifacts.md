# Streaming Artifacts

When an AI response contains standalone code or files, you normally have to parse `stream.text` yourself to extract and render them separately from prose. This is error-prone during streaming. The **artifacts** feature adds a reactive `artifacts` surface directly on the stream object — automatically populated as the model emits artifact markers — so you can render code in a separate pane without any parsing logic.

Detection is **fully pluggable**: you provide a detector function that matches whatever convention your system prompt establishes. aibind ships ready-made detectors for the most common conventions.

## Setup

```ts
import * as detectors from "@aibind/sveltekit/artifact";
// or: "@aibind/nextjs/artifact", "@aibind/nuxt/artifact",
//     "@aibind/react/artifact", "@aibind/vue/artifact", "@aibind/solid/artifact"

const stream = new Stream({
  artifact: { detector: detectors.claude },
});
```

The `artifact` option is an object so it can be extended in future versions without breaking changes.

## Reactive surface

```ts
stream.artifacts       // Artifact[] — all artifacts seen so far
stream.activeArtifact  // Artifact | null — currently streaming artifact (null when none)
```

`activeArtifact` is derived from `artifacts` — it's the last artifact that is not yet `complete`. It becomes `null` the moment the close marker arrives.

## Artifact type

```ts
interface Artifact {
  id: string;        // stable identifier — from the detector or auto-generated
  language: string;  // e.g. "tsx", "python" — from the open marker
  title: string;     // display name — from the open marker, "" if not present
  content: string;   // accumulates line-by-line during streaming
  complete: boolean; // true after the close marker (or when stream ends with artifact open)
}
```

## Built-in detectors

Import via the `/artifact` subpath of any aibind package:

```ts
import * as detectors from "@aibind/sveltekit/artifact";
```

| Export | Format | Notes |
|--------|--------|-------|
| `detectors.default` | `<artifact lang="tsx" title="Counter">…</artifact>` | Standard tag convention |
| `detectors.claude` | `<antArtifact identifier="id" language="tsx" title="Counter">…</antArtifact>` | Claude.ai native format |
| `detectors.fence` | `` ```tsx `` … `` ``` `` | Fenced code blocks |

::: warning Fence detector caveat
Code fences appear inline in prose too (e.g. `` `useEffect` ``). Use `detectors.fence` only when your system prompt instructs the model to emit **standalone** fenced blocks and not inline code.
:::

## Custom detector

Provide any function matching the `ArtifactDetector` signature:

```ts
import type { ArtifactDetector } from "@aibind/sveltekit/artifact";

// Example: ===FILE:path.ts / ===END convention
const fileDetector: ArtifactDetector = (line, inArtifact) => {
  if (!inArtifact && line.startsWith("===FILE:"))
    return { type: "open", language: "ts", title: line.slice(8) };
  if (inArtifact && line === "===END")
    return { type: "close" };
  if (inArtifact)
    return { type: "content", text: line };
  return null; // prose — ignore
};

const stream = new Stream({ artifact: { detector: fileDetector } });
```

The detector is called once per **complete line** in order. Return `null` for prose. The `inArtifact` parameter tells you whether you are currently inside an open artifact, so you can scope close-marker detection correctly.

### `ArtifactLineResult` union

```ts
type ArtifactLineResult =
  | { type: "open"; language: string; title: string; id?: string }
  | { type: "content"; text: string }
  | { type: "close" }
  | null;
```

Returning `id` from an `open` result uses that string as `artifact.id`. If omitted, an auto-generated `artifact-N` id is assigned.

## Framework examples

### Svelte / SvelteKit

```svelte
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";
  import * as detectors from "@aibind/sveltekit/artifact";

  const stream = new Stream({
    model: "smart",
    artifact: { detector: detectors.claude },
  });
</script>

<button onclick={() => stream.send("Write a counter component")}>Send</button>

<!-- Prose -->
<p>{stream.text}</p>

<!-- Active artifact — shown while streaming -->
{#if stream.activeArtifact}
  <div class="artifact-preview">
    <h3>{stream.activeArtifact.title}</h3>
    <pre><code>{stream.activeArtifact.content}</code></pre>
  </div>
{/if}

<!-- Completed artifacts panel -->
{#each stream.artifacts.filter(a => a.complete) as artifact (artifact.id)}
  <div class="artifact">
    <span class="badge">{artifact.language}</span>
    <h4>{artifact.title}</h4>
    <pre><code>{artifact.content}</code></pre>
  </div>
{/each}
```

### React / Next.js

```tsx
import { useStream } from "@aibind/nextjs";
import * as detectors from "@aibind/nextjs/artifact";

export function Chat() {
  const { text, artifacts, activeArtifact, send } = useStream({
    model: "smart",
    artifact: { detector: detectors.claude },
  });

  return (
    <div>
      <button onClick={() => send("Write a counter component")}>Send</button>

      {/* Prose */}
      <p>{text}</p>

      {/* Active artifact — shown while streaming */}
      {activeArtifact && (
        <div className="artifact-preview">
          <h3>{activeArtifact.title}</h3>
          <pre><code>{activeArtifact.content}</code></pre>
        </div>
      )}

      {/* Completed artifacts */}
      {artifacts.filter(a => a.complete).map(artifact => (
        <div key={artifact.id} className="artifact">
          <span>{artifact.language}</span>
          <h4>{artifact.title}</h4>
          <pre><code>{artifact.content}</code></pre>
        </div>
      ))}
    </div>
  );
}
```

### Vue / Nuxt

```vue
<script setup lang="ts">
import { useStream } from "@aibind/nuxt";
import * as detectors from "@aibind/nuxt/artifact";

const { text, artifacts, activeArtifact, send } = useStream({
  model: "smart",
  artifact: { detector: detectors.claude },
});
</script>

<template>
  <button @click="send('Write a counter component')">Send</button>

  <p>{{ text }}</p>

  <div v-if="activeArtifact" class="artifact-preview">
    <h3>{{ activeArtifact.title }}</h3>
    <pre><code>{{ activeArtifact.content }}</code></pre>
  </div>

  <div
    v-for="artifact in artifacts.filter(a => a.complete)"
    :key="artifact.id"
    class="artifact"
  >
    <span>{{ artifact.language }}</span>
    <h4>{{ artifact.title }}</h4>
    <pre><code>{{ artifact.content }}</code></pre>
  </div>
</template>
```

### SolidJS / SolidStart

```tsx
import { useStream } from "@aibind/solidstart";
import * as detectors from "@aibind/solidstart/artifact";
import { For, Show } from "solid-js";

export function Chat() {
  const { text, artifacts, activeArtifact, send } = useStream({
    model: "smart",
    artifact: { detector: detectors.claude },
  });

  return (
    <div>
      <button onClick={() => send("Write a counter component")}>Send</button>

      <p>{text()}</p>

      <Show when={activeArtifact()}>
        {(a) => (
          <div class="artifact-preview">
            <h3>{a().title}</h3>
            <pre><code>{a().content}</code></pre>
          </div>
        )}
      </Show>

      <For each={artifacts().filter(a => a.complete)}>
        {(artifact) => (
          <div class="artifact">
            <span>{artifact.language}</span>
            <h4>{artifact.title}</h4>
            <pre><code>{artifact.content}</code></pre>
          </div>
        )}
      </For>
    </div>
  );
}
```

## System prompt guidance

The model needs to know what format to use. Provide it in your server handler system prompt:

::: code-group

```ts [Claude format]
// src/hooks.server.ts (SvelteKit)
export const handle = createStreamHandler({
  models: defineModels({ smart: openrouter("anthropic/claude-sonnet-4-5") }),
  system: `When writing standalone code files, wrap them in antArtifact tags:
<antArtifact identifier="unique-id" type="application/code" language="tsx" title="Component Name">
  // code here
</antArtifact>
Write prose and explanation outside these tags.`,
});
```

```ts [Standard format]
export const handle = createStreamHandler({
  system: `When writing standalone code files, wrap them in artifact tags:
<artifact lang="tsx" title="Component Name">
  // code here
</artifact>
Write prose outside these tags.`,
});
```

:::

## Edge cases

| Scenario | Behavior |
|----------|----------|
| Marker split across chunks | Scanning only processes complete lines — partial trailing line waits for the next chunk |
| Stream ends while artifact is open | The open artifact is automatically marked `complete: true` |
| Multiple artifacts in one response | Each `open` result pushes a new entry; all accumulate in `artifacts` |
| Prose before/after artifact | `null` results are ignored; prose never creates an artifact |
| No `artifact` option provided | Scanning is skipped entirely — zero overhead |
