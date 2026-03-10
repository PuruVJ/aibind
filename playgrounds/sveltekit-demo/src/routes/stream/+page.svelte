<script lang="ts">
  import { Stream } from "@aibind/sveltekit";

  const stream = new Stream({
    system: "You are a helpful assistant. Keep responses concise.",
    model: "gpt",
  });

  let prompt = $state("");

  let speaking = $state(false);
  let stopSpeak = $state<(() => void) | null>(null);
  let rate = $state(1.0);
  let lang = $state("en-US");

  function startSpeaking() {
    speaking = true;
    stopSpeak = stream.speak({ rate, lang });
  }

  function stopSpeaking() {
    stopSpeak?.();
    speaking = false;
    stopSpeak = null;
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
  {#if !speaking}
    <button type="button" class="tts-btn" onclick={startSpeaking}>
      🔊 Speak
    </button>
  {:else}
    <button type="button" class="tts-btn tts-btn--stop" onclick={stopSpeaking}>
      🔇 Stop speaking
    </button>
  {/if}

  <div class="tts-options">
    <label class="tts-label">
      Rate: {rate.toFixed(1)}
      <input
        type="range"
        min="0.5"
        max="2"
        step="0.1"
        bind:value={rate}
        class="tts-range"
      />
    </label>

    <label class="tts-label">
      Language:
      <select bind:value={lang} class="tts-select">
        <option value="en-US">English (US)</option>
        <option value="en-GB">English (UK)</option>
        <option value="fr-FR">French</option>
        <option value="de-DE">German</option>
        <option value="es-ES">Spanish</option>
        <option value="ja-JP">Japanese</option>
      </select>
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
  }

  .tts-btn {
    align-self: flex-start;
    padding: 0.375rem 0.75rem;
    border-radius: 0.375rem;
    border: 1px solid #d1d5db;
    background: #f9fafb;
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
</style>
