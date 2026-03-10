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
"@aibind/tanstack-start": minor
"@aibind/react-router": minor
---

Add `stream.speak()` — streaming TTS via the Web Speech API.

Pipe the text stream directly into the browser's Web Speech API. Playback starts as the first sentence completes — no waiting for the full response. Sentence boundary detection queues utterances smoothly. Returns a cleanup function that cancels speech; also auto-cleans on component destroy in Svelte.

Speak mode persists across multiple `send()` calls until the returned cleanup function is called.

**New APIs:**

- `stream.speak(opts?)` — enable streaming TTS. Returns `() => void` to cancel.
- `SpeakOptions` — `{ rate?, pitch?, volume?, lang?, voice? }` — maps directly to `SpeechSynthesisUtterance` properties.

**Example:**

```ts
const stream = useStream({ endpoint: '/api/stream' });
const stopSpeaking = stream.speak({ rate: 1.2, lang: 'en-US' });

stream.send("Tell me about quantum computing");
// → audio starts playing as first sentence completes

// Later:
stopSpeaking();
```

No-op in non-browser environments (SSR-safe).
