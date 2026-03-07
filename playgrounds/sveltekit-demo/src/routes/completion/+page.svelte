<script lang="ts">
  import { Completion } from "@aibind/sveltekit";

  const completion = new Completion({
    system: "Complete the text naturally. Output only the continuation — no extra commentary.",
    model: "gpt",
    debounce: 400,
    minLength: 4,
  });

  let input = $state("");

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Tab" && completion.suggestion) {
      e.preventDefault();
      input = completion.accept();
    }
    if (e.key === "Escape") {
      completion.clear();
    }
  }
</script>

<div class="container">
  <h1>Inline Completion Demo</h1>
  <p class="subtitle">
    Type at least 4 characters. The model will suggest a continuation as ghost text.
    Press <kbd>Tab</kbd> to accept, <kbd>Esc</kbd> to dismiss.
  </p>

  <div class="editor-wrapper">
    <div class="ghost-layer" aria-hidden="true">
      <span class="typed">{input}</span><span class="ghost">{completion.suggestion}</span>
    </div>
    <textarea
      bind:value={input}
      oninput={() => completion.update(input)}
      onkeydown={handleKeydown}
      placeholder="Start typing…"
      rows={5}
      spellcheck={false}
    ></textarea>
  </div>

  <div class="hints">
    {#if completion.loading}
      <span class="loading-hint">Fetching suggestion…</span>
    {:else if completion.suggestion}
      <span class="tab-hint"><kbd>Tab</kbd> to accept · <kbd>Esc</kbd> to dismiss</span>
    {/if}
  </div>

  {#if completion.error}
    <div class="error">{completion.error.message}</div>
  {/if}
</div>

<style>
  .container { max-width: 38rem; }

  h1 { margin: 0 0 0.25rem; font-size: 1.5rem; }

  .subtitle {
    color: #6b7280;
    font-size: 0.875rem;
    margin: 0 0 1.25rem;
  }

  kbd {
    display: inline-block;
    padding: 0.125rem 0.375rem;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 0.25rem;
    font-family: inherit;
    font-size: 0.8em;
    color: #374151;
  }

  .editor-wrapper {
    position: relative;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    overflow: hidden;
    background: white;
    transition: border-color 0.15s;
  }

  .editor-wrapper:focus-within {
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
  }

  /* Ghost layer mirrors the textarea for overlay text */
  .ghost-layer {
    position: absolute;
    inset: 0;
    padding: 0.75rem;
    font-size: 0.9375rem;
    font-family: inherit;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    pointer-events: none;
    color: transparent;
  }

  .typed { color: transparent; }

  .ghost {
    color: #9ca3af;
  }

  textarea {
    display: block;
    width: 100%;
    padding: 0.75rem;
    border: none;
    outline: none;
    font-size: 0.9375rem;
    font-family: inherit;
    line-height: 1.6;
    resize: vertical;
    background: transparent;
    position: relative;
    color: #111827;
    box-sizing: border-box;
    caret-color: #6366f1;
  }

  .hints {
    margin-top: 0.5rem;
    min-height: 1.5rem;
    font-size: 0.8rem;
    color: #6b7280;
  }

  .tab-hint kbd {
    font-size: 0.75em;
    padding: 0.1rem 0.3rem;
  }

  .loading-hint {
    font-style: italic;
    color: #9ca3af;
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
