---
"@aibind/core": minor
"@aibind/svelte": minor
"@aibind/sveltekit": minor
"@aibind/react": minor
"@aibind/nextjs": minor
"@aibind/vue": minor
"@aibind/nuxt": minor
"@aibind/solid": minor
"@aibind/solidstart": minor
"@aibind/react-router": minor
"@aibind/tanstack-start": minor
---

Add multimodal attachment support to chat

`chat.send()`, `chat.optimistic()`, and `chat.edit()` now accept a second `opts` argument with an optional `attachments` field. Attachments are stored on `ChatMessage.attachments` and replayed automatically by `regenerate()`. A new `fileToAttachment(file: File)` browser utility converts a `File` to base64 `Attachment`. The server-side `StreamHandler` converts attachments to AI SDK `ImagePart`/`FilePart` format automatically.
