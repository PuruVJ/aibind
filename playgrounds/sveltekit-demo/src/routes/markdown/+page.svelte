<script lang="ts">
  import { Stream } from "@aibind/sveltekit";
  import { StreamMarkdown } from "@aibind/sveltekit/markdown";

  const stream = new Stream({
    system:
      "You are a helpful assistant. Always respond with rich markdown formatting: use headings, **bold**, *italic*, `inline code`, code blocks with language tags, bullet lists, and numbered lists where appropriate.",
    model: "gpt",
  });

  let prompt = $state("");
</script>

<h1>Markdown Demo</h1>
<p>
  Streaming markdown with live recovery — unterminated syntax renders
  gracefully.
</p>

<form
  onsubmit={(e) => {
    e.preventDefault();
    stream.send(prompt);
    prompt = "";
  }}
>
  <input
    bind:value={prompt}
    placeholder="Ask something (try 'explain async/await')..."
  />
  <button type="submit" disabled={stream.loading}>
    {stream.loading ? "Streaming..." : "Send"}
  </button>
  {#if stream.loading}
    <button type="button" onclick={() => stream.abort()}>Stop</button>
  {/if}
</form>

{#if stream.text}
  <div class="response">
    <StreamMarkdown text={stream.text} streaming={stream.loading} />
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
  }
  .response :global(pre) {
    background: #1f2937;
    color: #f9fafb;
    padding: 1rem;
    border-radius: 0.375rem;
    overflow-x: auto;
  }
  .response :global(code) {
    font-size: 0.875rem;
  }
  .response :global(p code) {
    background: #e5e7eb;
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
  }
  .error {
    color: #dc2626;
    padding: 1rem;
  }
</style>
