---
"@aibind/core": minor
---

## `stream.speak()` — streaming Web Speech API

`StreamController` gains a `speak()` method that pipes the streaming response into the browser's `SpeechSynthesis` API sentence by sentence. Audio playback starts after the first complete sentence — no waiting for the full response. Returns a cleanup function to cancel speech.

```ts
const stream = new Stream({ endpoint: "..." });
const stopSpeaking = stream.speak();

stream.send("Explain quantum entanglement");
// Audio begins playing as sentences complete

stopSpeaking(); // cancel at any time
```

No-op in non-browser environments (SSR, Node). Zero dependencies — uses `window.speechSynthesis`.
