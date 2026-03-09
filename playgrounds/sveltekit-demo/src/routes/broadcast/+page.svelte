<script lang="ts">
  import { Stream } from "@aibind/sveltekit";

  const CHANNEL = "aibind-demo";

  const stream = new Stream({
    system: "You are a helpful assistant. Keep responses concise.",
    model: "gpt",
  });

  // Start broadcasting immediately — any open mirror tab receives updates.
  stream.broadcast(CHANNEL);

  let prompt = $state("");
</script>

<div class="container">
  <h1>Cross-tab Broadcast — Source</h1>
  <p class="subtitle">
    This page broadcasts on channel <code>{CHANNEL}</code>. Open the
    <a href="/broadcast/mirror" target="_blank">Mirror page ↗</a> in another tab to
    see updates appear in real time without making a second HTTP request.
  </p>

  <div class="channel-badge">
    <span class="dot"></span>
    Broadcasting on <code>{CHANNEL}</code>
  </div>

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

  {#if stream.text}
    <div class="response" class:streaming={stream.loading}>
      <div class="label">Local response</div>
      {stream.text}{#if stream.loading}<span class="cursor">▌</span>{/if}
    </div>
  {/if}

  {#if stream.error}
    <div class="error">{stream.error.message}</div>
  {/if}
</div>

<style>
  .container {
    max-width: 42rem;
  }

  h1 {
    margin: 0 0 0.25rem;
    font-size: 1.5rem;
  }

  .subtitle {
    color: #6b7280;
    font-size: 0.875rem;
    margin: 0 0 1rem;
  }

  .subtitle a {
    color: #4f46e5;
  }

  .channel-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.875rem;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 9999px;
    font-size: 0.8125rem;
    color: #15803d;
    margin-bottom: 1.25rem;
  }

  .dot {
    width: 8px;
    height: 8px;
    background: #22c55e;
    border-radius: 50%;
    animation: ping 1.5s ease-in-out infinite;
  }

  @keyframes ping {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  form {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.25rem;
  }

  input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.9375rem;
    outline: none;
  }

  input:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
  }

  button {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    background: #4f46e5;
    color: white;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  button:last-child:not([type="submit"]) {
    background: #dc2626;
  }

  .response {
    background: #f3f4f6;
    padding: 1rem;
    border-radius: 0.5rem;
    white-space: pre-wrap;
    font-size: 0.9375rem;
    line-height: 1.6;
  }

  .streaming {
    opacity: 0.85;
  }

  .label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b7280;
    margin-bottom: 0.375rem;
  }

  .cursor {
    animation: blink 0.6s step-end infinite;
    color: #6366f1;
  }

  @keyframes blink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0;
    }
  }

  .error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    margin-top: 1rem;
  }
</style>
