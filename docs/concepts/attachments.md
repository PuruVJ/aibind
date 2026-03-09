# Attachments

Send images and files alongside chat messages. The server receives the content as AI SDK parts and passes them to the model — no extra endpoints, no multipart encoding.

## Quickstart

```ts
import { fileToAttachment } from "@aibind/core";

// In a file input handler
async function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const attachment = await fileToAttachment(file);
  chat.send("Describe this image", { attachments: [attachment] });
}
```

`fileToAttachment` reads the `File` as base64 using `FileReader`. The result is a plain `{ mimeType, data }` object that travels in the JSON body of the chat request.

## API

### `fileToAttachment(file)`

**Browser-only** — uses `FileReader`. Does not work in server/Node contexts.

```ts
import { fileToAttachment } from "@aibind/core";

const att = await fileToAttachment(file); // File → Attachment
```

Returns `Promise<Attachment>`:

```ts
interface Attachment {
  mimeType: string; // e.g. "image/png", "application/pdf"
  data?: string; // base64 (no "data:" prefix) — set by fileToAttachment()
  url?: string; // remote URL — alternative to data
}
```

You can also construct an `Attachment` manually if you have a remote URL:

```ts
chat.send("Summarise this document", {
  attachments: [
    { mimeType: "application/pdf", url: "https://example.com/report.pdf" },
  ],
});
```

### `chat.send(text, opts?)`

```ts
chat.send(text: string, opts?: ChatSendOptions): void

interface ChatSendOptions {
  attachments?: Attachment[];
}
```

Attachments are stored on the `ChatMessage` so `regenerate()` replays them automatically.

## Multi-framework examples

::: code-group

```svelte [SvelteKit]
<script lang="ts">
  import { Chat } from "@aibind/sveltekit";
  import { fileToAttachment } from "@aibind/core";

  const chat = new Chat();
  let file = $state<File | null>(null);

  async function submit() {
    const opts = file
      ? { attachments: [await fileToAttachment(file)] }
      : undefined;
    chat.send(prompt, opts);
  }
</script>

<input type="file" onchange={(e) => (file = e.target.files?.[0] ?? null)} />
<button onclick={submit}>Send</button>
```

```tsx [Next.js]
"use client";

import { useChat } from "@aibind/nextjs";
import { fileToAttachment } from "@aibind/core";
import { useRef } from "react";

export default function Page() {
  const { send } = useChat();
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    const file = fileRef.current?.files?.[0];
    const opts = file
      ? { attachments: [await fileToAttachment(file)] }
      : undefined;
    send("Describe this", opts);
  }

  return (
    <>
      <input ref={fileRef} type="file" />
      <button onClick={submit}>Send</button>
    </>
  );
}
```

```vue [Nuxt]
<script setup lang="ts">
import { useChat } from "@aibind/nuxt";
import { fileToAttachment } from "@aibind/core";

const { send } = useChat();
let file: File | null = null;

async function submit() {
  const opts = file
    ? { attachments: [await fileToAttachment(file)] }
    : undefined;
  send("Describe this", opts);
}
</script>

<template>
  <input type="file" @change="(e) => (file = e.target.files?.[0] ?? null)" />
  <button @click="submit">Send</button>
</template>
```

```tsx [SolidStart]
import { useChat } from "@aibind/solidstart";
import { fileToAttachment } from "@aibind/core";

export default function Page() {
  const { send } = useChat();
  let fileInput!: HTMLInputElement;

  async function submit() {
    const file = fileInput.files?.[0];
    const opts = file
      ? { attachments: [await fileToAttachment(file)] }
      : undefined;
    send("Describe this", opts);
  }

  return (
    <>
      <input ref={fileInput} type="file" />
      <button onClick={submit}>Send</button>
    </>
  );
}
```

:::

## Multiple attachments

Pass any number of attachments in a single message:

```ts
const [img1, img2] = await Promise.all([
  fileToAttachment(imageFile1),
  fileToAttachment(imageFile2),
]);

chat.send("Compare these two screenshots", { attachments: [img1, img2] });
```

## How it works

1. `fileToAttachment` reads the file as a base64 data URL and strips the `data:<mime>;base64,` prefix.
2. The client sends `{ messages, attachments }` in the JSON body — no `multipart/form-data`.
3. `StreamHandler` on the server converts messages with attachments to AI SDK `CoreMessage` content parts:
   - Images → `{ type: "image", image: data | url, mimeType }`
   - Other files → `{ type: "file", data: data | url, mimeType }`
4. The model receives a multimodal message and responds normally.

## ChatMessage

Attachments are preserved on the `ChatMessage` after send:

```ts
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  optimistic?: boolean;
  attachments?: Attachment[]; // present on user messages with attachments
}
```

This means `regenerate()` automatically replays the original attachments without any extra tracking.
