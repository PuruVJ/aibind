<script lang="ts">
  import { Stream } from "@aibind/sveltekit";
  import { fence } from "@aibind/sveltekit/artifact";

  const stream = new Stream({
    system:
      "You are a coding assistant. Always wrap code in fenced code blocks with the correct language tag. For example: ```tsx\n...\n```",
    model: "gpt",
    artifact: { detector: fence },
  });

  let prompt = $state("");
</script>

<div class="container">
  <h1>Streaming Artifacts Demo</h1>
  <p class="subtitle">
    The <code>fenceDetector</code> extracts code fences from the stream in real time.
    <code>stream.artifacts</code> populates as the model writes code.
  </p>

  <form
    onsubmit={(e) => {
      e.preventDefault();
      stream.send(prompt);
      prompt = "";
    }}
  >
    <input bind:value={prompt} placeholder='Try "Write a React counter component"' />
    <button type="submit" disabled={stream.loading}>
      {stream.loading ? "Streaming..." : "Send"}
    </button>
    {#if stream.loading}
      <button type="button" onclick={() => stream.abort()}>Stop</button>
    {/if}
  </form>

  {#if stream.text || stream.artifacts.length > 0}
    <div class="panels">
      <div class="panel">
        <h2>Raw response</h2>
        <pre class="raw">{stream.text}{#if stream.loading}<span class="cursor">▌</span>{/if}</pre>
      </div>

      <div class="panel">
        <h2>Extracted artifacts ({stream.artifacts.length})</h2>
        {#if stream.artifacts.length === 0}
          <p class="empty">Waiting for code fences…</p>
        {:else}
          {#each stream.artifacts as artifact (artifact.id)}
            <div class="artifact" class:streaming={!artifact.complete}>
              <div class="artifact-header">
                <span class="lang">{artifact.language || "text"}</span>
                {#if !artifact.complete}
                  <span class="badge streaming">streaming</span>
                {:else}
                  <span class="badge done">done</span>
                {/if}
              </div>
              <pre class="artifact-code">{artifact.content}{#if !artifact.complete && stream.loading}<span class="cursor">▌</span>{/if}</pre>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}

  {#if stream.error}
    <div class="error">{stream.error.message}</div>
  {/if}
</div>

<style>
  .container { max-width: 100%; }

  h1 { margin: 0 0 0.25rem; font-size: 1.5rem; }

  .subtitle {
    color: #6b7280;
    font-size: 0.875rem;
    margin: 0 0 1rem;
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

  input:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,0.15); }

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

  button:disabled { opacity: 0.5; cursor: not-allowed; }
  button:last-child:not([type="submit"]) { background: #dc2626; }

  .panels {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  @media (max-width: 700px) {
    .panels { grid-template-columns: 1fr; }
  }

  .panel h2 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
    margin: 0 0 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .raw {
    background: #1f2937;
    color: #f9fafb;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.8125rem;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-x: auto;
    max-height: 400px;
    overflow-y: auto;
  }

  .empty { color: #9ca3af; font-size: 0.875rem; padding: 1rem 0; }

  .artifact {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 0.5rem;
    margin-bottom: 0.75rem;
    overflow: hidden;
  }

  .artifact.streaming { border-color: #a5b4fc; }

  .artifact-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    background: #f1f5f9;
    border-bottom: 1px solid #e2e8f0;
  }

  .lang {
    font-size: 0.75rem;
    font-weight: 600;
    color: #475569;
    font-family: monospace;
  }

  .badge {
    font-size: 0.65rem;
    font-weight: 600;
    padding: 0.125rem 0.4rem;
    border-radius: 9999px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .badge.streaming { background: #ede9fe; color: #7c3aed; }
  .badge.done { background: #dcfce7; color: #16a34a; }

  .artifact-code {
    padding: 0.75rem 1rem;
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
    color: #1e293b;
    max-height: 350px;
    overflow-y: auto;
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
