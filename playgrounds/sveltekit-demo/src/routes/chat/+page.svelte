<script lang="ts">
  import { Chat } from "@aibind/sveltekit";
  import type { ChatMessage } from "@aibind/sveltekit";

  const chat = new Chat({
    system: "You are a helpful assistant. Keep responses concise (2-3 sentences).",
    model: "gpt",
  });

  let prompt = $state("");
  let editingId: string | null = $state(null);
  let editText = $state("");

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text || chat.loading) return;
    chat.send(text);
    prompt = "";
  }

  function startEdit(msg: ChatMessage) {
    editingId = msg.id;
    editText = msg.content;
  }

  function submitEdit(id: string) {
    const text = editText.trim();
    if (!text) return;
    editingId = null;
    chat.edit(id, text);
  }
</script>

<div class="container">
  <header>
    <h1>Chat Demo</h1>
    <p class="subtitle">
      Multi-turn chat using <code>new Chat()</code>. Edit user messages, regenerate responses,
      or clear the conversation.
    </p>
    {#if chat.messages.length > 0}
      <button class="clear-btn" onclick={() => chat.clear()}>Clear</button>
    {/if}
  </header>

  <div class="messages">
    {#each chat.messages as msg (msg.id)}
      <div class="message {msg.role}" class:optimistic={msg.optimistic}>
        <span class="role-label">{msg.role === "user" ? "You" : "Assistant"}</span>

        {#if editingId === msg.id}
          <form onsubmit={(e) => { e.preventDefault(); submitEdit(msg.id); }}>
            <textarea bind:value={editText} rows={2}></textarea>
            <div class="edit-actions">
              <button type="submit">Save & Send</button>
              <button type="button" onclick={() => { editingId = null; }}>Cancel</button>
            </div>
          </form>
        {:else}
          <div class="content">
            {msg.content}{#if chat.loading && msg.role === "assistant" && msg === chat.messages.at(-1) && !msg.content}<span class="dot-pulse"></span>{/if}{#if chat.loading && msg.role === "assistant" && msg === chat.messages.at(-1) && msg.content}<span class="cursor">▌</span>{/if}
          </div>
          <div class="actions">
            {#if msg.role === "user"}
              <button class="action-btn" onclick={() => startEdit(msg)}>Edit</button>
            {:else}
              <button
                class="action-btn"
                disabled={chat.loading}
                onclick={() => chat.regenerate()}
              >
                Regenerate
              </button>
            {/if}
          </div>
        {/if}
      </div>
    {/each}

    {#if chat.messages.length === 0 && !chat.loading}
      <div class="empty">Start a conversation below.</div>
    {/if}
  </div>

  {#if chat.error}
    <div class="error">
      {chat.error.message}
      <button class="revert-btn" onclick={() => { prompt = chat.revert() ?? prompt; }}>
        Undo send
      </button>
    </div>
  {/if}

  <form class="input-form" onsubmit={handleSubmit}>
    <input
      bind:value={prompt}
      placeholder="Type a message..."
      disabled={chat.loading}
    />
    {#if chat.loading}
      <button type="button" class="stop-btn" onclick={() => chat.abort()}>Stop</button>
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
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  h1 { margin: 0; font-size: 1.5rem; flex: none; }

  .subtitle {
    margin: 0;
    color: #6b7280;
    font-size: 0.85rem;
    flex: 1;
  }

  .clear-btn {
    padding: 0.25rem 0.75rem;
    font-size: 0.8rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    background: white;
    color: #6b7280;
    cursor: pointer;
  }

  .clear-btn:hover { background: #f3f4f6; }

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

  .message.optimistic {
    opacity: 0.6;
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
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
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
    0%, 100% { opacity: 0.4; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1.2); }
  }

  .actions {
    margin-top: 0.375rem;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .message:hover .actions { opacity: 1; }

  .action-btn {
    padding: 0.2rem 0.5rem;
    font-size: 0.7rem;
    background: transparent;
    border: 1px solid #d1d5db;
    border-radius: 0.25rem;
    color: #6b7280;
    cursor: pointer;
  }

  .action-btn:hover:not(:disabled) { background: #f3f4f6; color: #374151; }
  .action-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  textarea {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.9375rem;
    font-family: inherit;
    resize: vertical;
    outline: none;
    box-sizing: border-box;
  }

  textarea:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,0.15); }

  .edit-actions {
    display: flex;
    gap: 0.375rem;
    margin-top: 0.375rem;
  }

  .edit-actions button {
    padding: 0.3rem 0.625rem;
    font-size: 0.75rem;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    font-weight: 500;
  }

  .edit-actions button[type="submit"] { background: #4f46e5; color: white; }
  .edit-actions button[type="submit"]:hover { background: #4338ca; }
  .edit-actions button[type="button"] { background: #e5e7eb; color: #374151; }
  .edit-actions button[type="button"]:hover { background: #d1d5db; }

  .error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    margin-bottom: 0.75rem;
    font-size: 0.875rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .revert-btn {
    margin-left: auto;
    padding: 0.2rem 0.6rem;
    font-size: 0.75rem;
    background: white;
    border: 1px solid #fecaca;
    border-radius: 0.25rem;
    color: #dc2626;
    cursor: pointer;
    white-space: nowrap;
  }

  .revert-btn:hover { background: #fef2f2; }

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

  input:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,0.15); }
  input:disabled { background: #f9fafb; color: #9ca3af; }

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

  .input-form button:hover:not(:disabled) { background: #4338ca; }
  .input-form button:disabled { opacity: 0.5; cursor: not-allowed; }

  .stop-btn { background: #dc2626 !important; }
  .stop-btn:hover { background: #b91c1c !important; }
</style>
