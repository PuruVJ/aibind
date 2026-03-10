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
---

Add `chat.generateTitle()` — live-streaming conversation title generation.

Streams a 2–6 word title from the current conversation into `chat.title` character by character, matching the ChatGPT/Claude auto-title UX. Set `autoTitle: true` to fire automatically after the first turn (once only), or call `chat.generateTitle()` manually at any point.

**New APIs:**
- `chat.generateTitle(opts?)` — generates and streams a title from accumulated messages
- `chat.title: string | null` — the current title, updated reactively as it streams
- `chat.titleLoading: boolean` — true while the title is being generated
- `autoTitle?: boolean` on Chat options — auto-fires after the first completed turn
- `titleEndpoint?: string` on Chat options — custom endpoint (default: `/__aibind__/title`)
- `/__aibind__/title` — new endpoint auto-registered by `createStreamHandler`
