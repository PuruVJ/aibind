<script lang="ts">
  import { Chat } from "@aibind/sveltekit";

  let _activeToolCall: string | null = $state(null);
  let prompt = $state("");

  const chat = new Chat({
    toolset: "assistant",
    maxSteps: 3,
    onToolCall: (name: string) => {
      _activeToolCall = name;
    },
  });

  const activeToolCall: string | null = $derived(
    chat.loading ? _activeToolCall : null,
  );

  function handleSubmit(e: SubmitEvent): void {
    e.preventDefault();
    const text = prompt.trim();
    if (!text || chat.loading) return;
    chat.send(text);
    prompt = "";
  }
</script>

<div class="container">
  <header>
    <h1>Chat with Tools Demo</h1>
    <p class="subtitle">
      The model has access to <code>get_weather</code> and
      <code>get_time</code> tools. Ask it about the weather or current time.
    </p>
    <div class="tools-available">
      <span class="tools-label">Available tools:</span>
      <span class="tool-pill">get_weather</span>
      <span class="tool-pill">get_time</span>
    </div>
  </header>

  {#if activeToolCall}
    <div class="tool-indicator">
      <span class="tool-spinner"></span>
      Using {activeToolCall}&hellip;
    </div>
  {/if}

  <div class="messages">
    {#each chat.messages as msg (msg.id)}
      <div class="message {msg.role}">
        <span class="role-label"
          >{msg.role === "user" ? "You" : "Assistant"}</span
        >
        <div class="content">
          {msg.content}{#if chat.loading && msg.role === "assistant" && msg === chat.messages.at(-1) && !msg.content}<span
              class="dot-pulse"

            ></span>{/if}{#if chat.loading && msg.role === "assistant" && msg === chat.messages.at(-1) && msg.content}<span
              class="cursor">▌</span
            >{/if}
        </div>
      </div>
    {/each}

    {#if chat.messages.length === 0 && !chat.loading}
      <div class="empty">
        Try asking "What's the weather in Tokyo?" or "What time is it in
        London?"
      </div>
    {/if}
  </div>

  {#if chat.error}
    <div class="error">
      {chat.error.message}
    </div>
  {/if}

  <form class="input-form" onsubmit={handleSubmit}>
    <input
      bind:value={prompt}
      placeholder="Try &quot;What's the weather in Tokyo?&quot;"
      disabled={chat.loading}
    />
    {#if chat.loading}
      <button type="button" class="stop-btn" onclick={() => chat.abort()}
        >Stop</button
      >
    {:else}
      <button type="submit" disabled={!prompt.trim()}>Send</button>
    {/if}
  </form>
</div>

<style>
  .container {
    display: flex;
    flex-direction: column;
    min-height: 60vh;
  }

  header {
    margin-bottom: 1.25rem;
  }

  h1 {
    margin: 0 0 0.375rem;
    font-size: 1.5rem;
  }

  .subtitle {
    margin: 0 0 0.75rem;
    color: #6b7280;
    font-size: 0.85rem;
  }

  .tools-available {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .tools-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .tool-pill {
    display: inline-flex;
    align-items: center;
    padding: 0.2rem 0.6rem;
    font-size: 0.75rem;
    font-family: ui-monospace, monospace;
    font-weight: 500;
    background: #ede9fe;
    color: #5b21b6;
    border: 1px solid #c4b5fd;
    border-radius: 9999px;
  }

  .tool-indicator {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.75rem;
    font-size: 0.8rem;
    font-weight: 500;
    color: #4f46e5;
    background: #eef2ff;
    border: 1px solid #c7d2fe;
    border-radius: 9999px;
    margin-bottom: 0.875rem;
    align-self: flex-start;
  }

  .tool-spinner {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 2px solid #c7d2fe;
    border-top-color: #4f46e5;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .messages {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding-bottom: 1rem;
  }

  .empty {
    color: #9ca3af;
    text-align: center;
    padding: 3rem 0;
    font-size: 0.9rem;
  }

  .message {
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    max-width: 85%;
    position: relative;
  }

  .message.user {
    background: #dbeafe;
    align-self: flex-end;
    border-bottom-right-radius: 0.125rem;
  }

  .message.assistant {
    background: #f3f4f6;
    align-self: flex-start;
    border-bottom-left-radius: 0.125rem;
  }

  .role-label {
    display: block;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.25rem;
    color: #6b7280;
  }

  .content {
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 0.9375rem;
    line-height: 1.5;
    min-height: 1.2em;
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

  .dot-pulse {
    display: inline-block;
    width: 8px;
    height: 8px;
    background: #6366f1;
    border-radius: 50%;
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.4;
      transform: scale(0.8);
    }
    50% {
      opacity: 1;
      transform: scale(1.2);
    }
  }

  .error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    margin-bottom: 0.75rem;
    font-size: 0.875rem;
  }

  .input-form {
    display: flex;
    gap: 0.5rem;
    padding-top: 0.75rem;
    border-top: 1px solid #e5e7eb;
  }

  input {
    flex: 1;
    padding: 0.625rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.9375rem;
    outline: none;
    transition: border-color 0.15s;
  }

  input:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
  }

  input:disabled {
    background: #f9fafb;
    color: #9ca3af;
  }

  .input-form button {
    padding: 0.625rem 1.25rem;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    background: #4f46e5;
    color: white;
    transition: background 0.15s;
  }

  .input-form button:hover:not(:disabled) {
    background: #4338ca;
  }

  .input-form button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .stop-btn {
    background: #dc2626 !important;
  }

  .stop-btn:hover {
    background: #b91c1c !important;
  }
</style>
