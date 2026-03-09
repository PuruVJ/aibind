<script lang="ts">
  import { Race } from "@aibind/sveltekit";

  const race = new Race({
    models: ["gpt", "google"],
    system:
      "You are a helpful assistant. Keep responses concise (2-3 sentences).",
    strategy: "complete",
  });

  let prompt = $state("");
</script>

<div class="container">
  <h1>Model Race Demo</h1>
  <p class="subtitle">
    Both models receive the same prompt simultaneously. The first to finish wins
    and its response is shown. Strategy: <code>complete</code>.
  </p>

  <div class="models-row">
    <div class="model-pill">gpt-5-mini</div>
    <span class="vs">vs</span>
    <div class="model-pill">gemini-3.1-flash-lite</div>
  </div>

  <form
    onsubmit={(e) => {
      e.preventDefault();
      race.send(prompt);
      prompt = "";
    }}
  >
    <input
      bind:value={prompt}
      placeholder="Try "What is the speed of light?""
    />
    <button type="submit" disabled={race.loading}>
      {race.loading ? "Racing..." : "Race!"}
    </button>
    {#if race.loading}
      <button type="button" onclick={() => race.abort()}>Stop</button>
    {/if}
  </form>

  {#if race.loading && !race.text}
    <div class="waiting">
      <span class="dot-pulse"></span>
      <span class="dot-pulse" style="animation-delay: 0.15s"></span>
      <span class="dot-pulse" style="animation-delay: 0.3s"></span>
      <span>Waiting for first response…</span>
    </div>
  {/if}

  {#if race.text}
    <div class="result">
      {#if race.winner}
        <div class="winner-badge">
          Winner: <strong>{race.winner}</strong>
        </div>
      {/if}
      <div class="response" class:streaming={race.loading}>
        {race.text}{#if race.loading}<span class="cursor">▌</span>{/if}
      </div>
    </div>
  {/if}

  {#if race.error}
    <div class="error">{race.error.message}</div>
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

  .models-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }

  .model-pill {
    padding: 0.25rem 0.75rem;
    background: #ede9fe;
    color: #7c3aed;
    border-radius: 9999px;
    font-size: 0.8rem;
    font-weight: 600;
    font-family: monospace;
  }

  .vs {
    font-size: 0.75rem;
    font-weight: 700;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.1em;
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

  .waiting {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: #6b7280;
    font-size: 0.875rem;
    padding: 1rem 0;
  }

  .dot-pulse {
    display: inline-block;
    width: 7px;
    height: 7px;
    background: #6366f1;
    border-radius: 50%;
    animation: pulse 0.9s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.3;
      transform: scale(0.8);
    }
    50% {
      opacity: 1;
      transform: scale(1);
    }
  }

  .result {
    margin-top: 0.5rem;
  }

  .winner-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.875rem;
    background: #fef9c3;
    border: 1px solid #fde047;
    border-radius: 9999px;
    font-size: 0.8125rem;
    color: #854d0e;
    margin-bottom: 0.75rem;
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
