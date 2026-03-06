<script lang="ts">
  import { Stream } from "@aibind/sveltekit";
  import type { StreamStatus } from "@aibind/sveltekit";

  const stream = new Stream({
    system: "You are a helpful assistant. Keep responses concise.",
    model: "gpt",
  });

  let prompt = $state("");

  const statusColors: Record<StreamStatus, string> = {
    idle: "#9ca3af",
    streaming: "#22c55e",
    reconnecting: "#eab308",
    done: "#3b82f6",
    stopped: "#f97316",
    error: "#dc2626",
    disconnected: "#dc2626",
  };

  let badgeColor = $derived(statusColors[stream.status] ?? "#9ca3af");
</script>

<h1>Resumable Stream Demo</h1>

<p class="description">
  This demo shows abort+resume streaming. When you stop a stream, partial text
  is preserved and the server is signaled to halt LLM generation. If the
  connection drops, auto-reconnect kicks in. If reconnection fails, you can
  manually resume.
</p>

<form
  onsubmit={(e) => {
    e.preventDefault();
    const text = prompt.trim();
    if (!text) return;
    stream.send(text);
    prompt = "";
  }}
>
  <input bind:value={prompt} placeholder="Ask something..." />
  <button type="submit" disabled={stream.loading}>
    {stream.loading ? "Streaming..." : "Send"}
  </button>
</form>

<div class="controls">
  <span class="status-badge" style="background: {badgeColor}">
    {stream.status}
  </span>

  {#if stream.status === "streaming"}
    <button class="stop-btn" onclick={() => stream.stop()}>Stop</button>
  {/if}

  {#if stream.canResume}
    <button class="resume-btn" onclick={() => stream.resume()}>Resume</button>
  {/if}
</div>

{#if stream.text}
  <div class="response" class:streaming={stream.status === "streaming"}>
    {stream.text}{#if stream.status === "streaming"}▌{/if}
  </div>
{/if}

{#if stream.streamId}
  <div class="debug">stream-id: {stream.streamId}</div>
{/if}

{#if stream.error}
  <div class="error">
    <p>{stream.error.message}</p>
    <button onclick={() => stream.retry()}>Retry</button>
  </div>
{/if}

<style>
  h1 {
    margin: 0 0 0.25rem;
    font-size: 1.5rem;
  }

  .description {
    color: #6b7280;
    font-size: 0.875rem;
    line-height: 1.5;
    margin: 0 0 1.5rem;
  }

  form {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  input {
    flex: 1;
    padding: 0.5rem;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .status-badge {
    display: inline-block;
    padding: 0.2rem 0.6rem;
    border-radius: 9999px;
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stop-btn {
    padding: 0.35rem 0.75rem;
    background: #f97316;
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
  }

  .stop-btn:hover {
    background: #ea580c;
  }

  .resume-btn {
    padding: 0.35rem 0.75rem;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
  }

  .resume-btn:hover {
    background: #2563eb;
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

  .debug {
    margin-top: 0.5rem;
    font-family: monospace;
    font-size: 0.75rem;
    color: #9ca3af;
  }

  .error {
    color: #dc2626;
    padding: 1rem;
  }

  .error button {
    margin-top: 0.5rem;
    padding: 0.35rem 0.75rem;
    background: #dc2626;
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .error button:hover {
    background: #b91c1c;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
