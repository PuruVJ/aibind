# Markdown Rendering

AI responses are usually markdown. But rendering markdown mid-stream creates visual glitches — unterminated `**bold`, partial code blocks, broken `[links](`. aibind includes a streaming markdown parser that handles all of this, rendering clean HTML at every point during the stream.

## Framework Components

Every framework package includes a ready-to-use markdown component or hook.

::: code-group

```svelte [SvelteKit]
<script lang="ts">
  import { StreamMarkdown } from "@aibind/sveltekit/markdown";
  import { Stream } from "@aibind/sveltekit";

  const stream = new Stream({ model: "fast" });
</script>

<StreamMarkdown text={stream.text} streaming={stream.loading} />
```

```tsx [Next.js]
"use client";

import { StreamMarkdown } from "@aibind/nextjs/markdown";
import { useStream } from "@aibind/nextjs";

function Chat() {
  const { text, loading } = useStream({ model: "fast" });

  return <StreamMarkdown text={text} streaming={loading} />;
}
```

```vue [Nuxt]
<script setup lang="ts">
import { StreamMarkdown } from "@aibind/nuxt/markdown";
import { useStream } from "@aibind/nuxt";

const { text, loading } = useStream({ model: "fast" });
</script>

<template>
  <StreamMarkdown :text="text" :streaming="loading" />
</template>
```

```tsx [SolidStart]
// SolidJS uses a hook returning a reactive HTML string accessor
import { useStreamMarkdown } from "@aibind/solidstart/markdown";
import { useStream } from "@aibind/solidstart";

function Chat() {
  const { text, loading } = useStream({ model: "fast" });
  const html = useStreamMarkdown(
    () => text(),
    () => loading(),
  );

  return <div innerHTML={html()} />;
}
```

```tsx [TanStack Start]
import { StreamMarkdown } from "@aibind/tanstack-start/markdown";
import { useStream } from "@aibind/tanstack-start";

function Chat() {
  const { text, loading } = useStream({ model: "fast" });

  return <StreamMarkdown text={text} streaming={loading} />;
}
```

:::

**Props:** `text: string`, `streaming: boolean`, `class/className: string` (optional).
SolidStart exports `useStreamMarkdown` (hook) instead of a component.

## How It Works

The markdown system has three layers:

1. **StreamParser** — Incremental tokenizer. Feeds chunks of markdown and emits block/inline tokens to a renderer. Only re-parses new or active blocks (O(n) on new content, not total content).

2. **HtmlRenderer** — Converts tokens to an HTML string. XSS-safe by default (escapes HTML entities). The renderer is created once and reused via `renderer.reset()` for performance.

3. **MarkdownRecovery** — Detects and closes unterminated syntax so partial output always renders cleanly. Handles: unclosed code fences, bold (`**`), italic (`*`), strikethrough (`~~`), inline code (`` ` ``).

## Supported Markdown

- Headings (h1–h6)
- Paragraphs with hard line breaks
- **Bold**, _italic_, ~~strikethrough~~, `inline code`
- Nested bold/italic (`***bold italic***`)
- Code blocks with language tag
- Links `[text](url)` and images `![alt](src)`
- Unordered and ordered lists (with nesting)
- Blockquotes (with nesting)
- Horizontal rules

## Standalone Usage

You can use the markdown parser directly without any framework:

```ts
import { StreamParser, HtmlRenderer, MarkdownRecovery } from "@aibind/markdown";

const renderer = new HtmlRenderer();
const parser = new StreamParser(renderer);

// During streaming, recover incomplete syntax
const input = MarkdownRecovery.recover(partialText);
renderer.reset();
parser.reset();
parser.write(input);
parser.end();

console.log(renderer.html);
```

### Custom Renderers

Extend the `Renderer` base class to output something other than HTML:

```ts
import { Renderer, type Token } from "@aibind/markdown";

class MyRenderer extends Renderer {
  open(token: Token): void {
    /* element opened */
  }
  close(token: Token): void {
    /* element closed */
  }
  text(content: string): void {
    /* text content */
  }
  attr(key: string, value: string): void {
    /* attribute */
  }
}
```

## Import Paths

| Package                           | Import                                                         |
| --------------------------------- | -------------------------------------------------------------- |
| `@aibind/markdown`                | `StreamParser`, `HtmlRenderer`, `MarkdownRecovery`, `Renderer` |
| `@aibind/svelte/markdown`         | `StreamMarkdown` + all of the above                            |
| `@aibind/sveltekit/markdown`      | Same as svelte                                                 |
| `@aibind/vue/markdown`            | `StreamMarkdown` + all of the above                            |
| `@aibind/nuxt/markdown`           | Same as vue                                                    |
| `@aibind/react/markdown`          | `StreamMarkdown` + all of the above                            |
| `@aibind/nextjs/markdown`         | Same as react                                                  |
| `@aibind/solid/markdown`          | `useStreamMarkdown` + all of the above                         |
| `@aibind/solidstart/markdown`     | Same as solid                                                  |
| `@aibind/tanstack-start/markdown` | Same as react                                                  |
