<script lang="ts">
  import { onMount } from "svelte";
  import { Stream } from "@aibind/sveltekit";

  const stream = new Stream({
    system: "You are a helpful assistant. Keep responses concise.",
    model: "gpt",
  });

  let prompt = $state("");

  // TTS state
  let speaking = $state(false);
  let rate = $state(1.0);
  let selectedVoice = $state<SpeechSynthesisVoice | null>(null);
  let voices = $state<SpeechSynthesisVoice[]>([]);

  // Not $state — functions must not be proxied by Svelte reactivity
  let stopSpeak: (() => void) | null = null;

  onMount(() => {
    if (typeof speechSynthesis === "undefined") return;

    function loadVoices() {
      const all = speechSynthesis.getVoices();
      // Prefer "enhanced" / "Google" / "Premium" voices — much better quality
      voices = all.sort((a, b) => {
        const quality = (v: SpeechSynthesisVoice) =>
          v.name.includes("Enhanced") ||
          v.name.includes("Premium") ||
          v.name.includes("Google")
            ? 0
            : 1;
        return quality(a) - quality(b);
      });
      if (!selectedVoice && voices.length > 0) {
        selectedVoice = voices[0]!;
      }
    }

    loadVoices();
    speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () =>
      speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  });

  function startSpeaking() {
    speaking = true;
    stopSpeak = stream.speak({
      rate,
      voice: selectedVoice ?? undefined,
    });
  }

  function stopSpeaking() {
    stopSpeak?.();
    stopSpeak = null;
    speaking = false;
  }
</script>

<h1>Stream Demo</h1>

<form
  onsubmit={(e) => {
    e.preventDefault();
    stream.send(prompt);
    prompt = "";
  }}
>
  <input bind:value={prompt} placeholder="Ask something..." />
  <button type="submit" disabled={stream.loading}>
    {stream.loading ? "Streaming..." : "Send"}
  </button>
  {#if stream.loading}
    <button type="button" onclick={() => stream.abort()}>Stop</button>
  {/if}
</form>

<div class="tts-controls">
  <div class="tts-row">
    {#if !speaking}
      <button type="button" class="tts-btn" onclick={startSpeaking}>
        🔊 Speak
      </button>
    {:else}
      <button
        type="button"
        class="tts-btn tts-btn--stop"
        onclick={stopSpeaking}
      >
        🔇 Stop speaking
      </button>
    {/if}
  </div>

  <div class="tts-options">
    {#if voices.length > 0}
      <label class="tts-label">
        Voice:
        <select
          class="tts-select tts-select--wide"
          onchange={(e) => {
            const name = (e.target as HTMLSelectElement).value;
            selectedVoice = voices.find((v) => v.name === name) ?? null;
          }}
        >
          {#each voices as voice}
            <option value={voice.name} selected={voice === selectedVoice}>
              {voice.name}
              {#if voice.name.includes("Enhanced") || voice.name.includes("Premium") || voice.name.includes("Google")}✨{/if}
            </option>
          {/each}
        </select>
      </label>
    {/if}

    <label class="tts-label">
      Rate: {rate.toFixed(1)}×
      <input
        type="range"
        min="0.5"
        max="2"
        step="0.1"
        bind:value={rate}
        class="tts-range"
      />
    </label>
  </div>
</div>

{#if stream.text}
  <div class="response" class:streaming={stream.loading}>
    {stream.text}{#if stream.loading}▌{/if}
  </div>
{/if}

{#if stream.error}
  <div class="error">
    <p>{stream.error.message}</p>
    <button onclick={() => stream.retry()}>Retry</button>
  </div>
{/if}

<style>
  form {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  input {
    flex: 1;
    padding: 0.5rem;
  }
  .response {
    padding: 1rem;
    background: #f9fafb;
    border-radius: 0.5rem;
    white-space: pre-wrap;
  }
  .streaming {
    opacity: 0.8;
  }
  .error {
    color: #dc2626;
    padding: 1rem;
  }

  .tts-controls {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
    padding: 0.75rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
  }

  .tts-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .tts-btn {
    padding: 0.375rem 0.75rem;
    border-radius: 0.375rem;
    border: 1px solid #d1d5db;
    background: #fff;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .tts-btn:hover {
    background: #f3f4f6;
  }

  .tts-btn--stop {
    background: #fef2f2;
    border-color: #fca5a5;
    color: #dc2626;
  }

  .tts-btn--stop:hover {
    background: #fee2e2;
  }

  .tts-options {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
  }

  .tts-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: #374151;
  }

  .tts-range {
    width: 8rem;
    cursor: pointer;
  }

  .tts-select {
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;
    border: 1px solid #d1d5db;
    background: #fff;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .tts-select--wide {
    max-width: 20rem;
  }
</style>
