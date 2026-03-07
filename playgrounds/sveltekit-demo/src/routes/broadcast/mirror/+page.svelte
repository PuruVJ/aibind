<script lang="ts">
  import { StreamMirror } from "@aibind/sveltekit";

  const CHANNEL = "aibind-demo";

  const mirror = new StreamMirror(CHANNEL);
</script>

<div class="container">
  <h1>Cross-tab Broadcast — Mirror</h1>
  <p class="subtitle">
    This page is a read-only mirror of channel <code>{CHANNEL}</code>.
    No HTTP requests are made — it receives updates via <code>BroadcastChannel</code>.
    Open the <a href="/broadcast" target="_blank">Source page ↗</a> in another tab and send a message.
  </p>

  <div class="status-row">
    <div class="status-badge" class:active={mirror.loading}>
      <span class="dot" class:pulsing={mirror.loading}></span>
      {mirror.status}
    </div>
  </div>

  {#if mirror.text}
    <div class="response" class:streaming={mirror.loading}>
      <div class="label">Mirrored response</div>
      {mirror.text}{#if mirror.loading}<span class="cursor">▌</span>{/if}
    </div>
  {:else}
    <div class="empty">
      Waiting for a broadcast from the source page…
    </div>
  {/if}

  {#if mirror.error}
    <div class="error">{mirror.error}</div>
  {/if}
</div>

<style>
  .container { max-width: 42rem; }

  h1 { margin: 0 0 0.25rem; font-size: 1.5rem; }

  .subtitle {
    color: #6b7280;
    font-size: 0.875rem;
    margin: 0 0 1rem;
  }

  .subtitle a { color: #4f46e5; }

  .status-row { margin-bottom: 1.25rem; }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.875rem;
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    border-radius: 9999px;
    font-size: 0.8125rem;
    color: #475569;
    font-family: monospace;
  }

  .status-badge.active {
    background: #f0fdf4;
    border-color: #bbf7d0;
    color: #15803d;
  }

  .dot {
    width: 8px;
    height: 8px;
    background: #cbd5e1;
    border-radius: 50%;
  }

  .dot.pulsing {
    background: #22c55e;
    animation: ping 1.5s ease-in-out infinite;
  }

  @keyframes ping {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .empty {
    color: #9ca3af;
    font-size: 0.9rem;
    padding: 3rem 0;
    text-align: center;
  }

  .response {
    background: #f3f4f6;
    padding: 1rem;
    border-radius: 0.5rem;
    white-space: pre-wrap;
    font-size: 0.9375rem;
    line-height: 1.6;
  }

  .streaming { opacity: 0.85; }

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
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
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
