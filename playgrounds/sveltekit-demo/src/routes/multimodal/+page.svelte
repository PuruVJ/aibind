<script lang="ts">
  import { Chat, fileToAttachment } from "@aibind/sveltekit";
  import type { Attachment } from "@aibind/sveltekit";

  const chat = new Chat({
    model: "gpt",
    system: "You are a helpful vision assistant. Describe images in detail when provided.",
  });

  let prompt = $state("");
  let attachments = $state<Attachment[]>([]);
  let fileInput: HTMLInputElement;

  async function handleFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;
    const converted = await Promise.all(Array.from(files).map(fileToAttachment));
    attachments = [...attachments, ...converted];
    input.value = "";
  }

  function removeAttachment(index: number) {
    attachments = attachments.filter((_, i) => i !== index);
  }

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text || chat.loading) return;
    const toSend = attachments;
    prompt = "";
    attachments = [];
    chat.send(text, { attachments: toSend });
  }
</script>

<div class="container">
  <header>
    <h1>Multimodal Chat</h1>
    <p class="subtitle">
      Send images alongside text using <code>fileToAttachment</code> and
      <code>chat.send(text, &#123; attachments &#125;)</code>.
    </p>
    {#if chat.messages.length > 0}
      <button class="clear-btn" onclick={() => chat.clear()}>Clear</button>
    {/if}
  </header>

  <div class="messages">
    {#each chat.messages as msg (msg.id)}
      <div class="message {msg.role}" class:optimistic={msg.optimistic}>
        <span class="role-label">{msg.role === "user" ? "You" : "Assistant"}</span>

        {#if msg.attachments?.length}
          <div class="msg-attachments">
            {#each msg.attachments as att (att.data)}
              <img
                class="msg-image"
                src="data:{att.mimeType};base64,{att.data}"
                alt="Attached"
              />
            {/each}
          </div>
        {/if}

        <div class="content">
          {msg.content}{#if chat.loading && msg.role === "assistant" && msg === chat.messages.at(-1) && !msg.content}<span class="dot-pulse"></span>{/if}{#if chat.loading && msg.role === "assistant" && msg === chat.messages.at(-1) && msg.content}<span class="cursor">▌</span>{/if}
        </div>

        <div class="actions">
          {#if msg.role === "assistant"}
            <button
              class="action-btn"
              disabled={chat.loading}
              onclick={() => chat.regenerate()}
            >
              Regenerate
            </button>
          {/if}
        </div>
      </div>
    {/each}

    {#if chat.messages.length === 0 && !chat.loading}
      <div class="empty">Attach an image and start a conversation below.</div>
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
    {#if attachments.length > 0}
      <div class="attachment-preview">
        {#each attachments as att, i (att.data)}
          <div class="thumb-wrapper">
            <img
              class="thumb"
              src="data:{att.mimeType};base64,{att.data}"
              alt="Preview"
            />
            <button
              type="button"
              class="remove-thumb"
              onclick={() => removeAttachment(i)}
              aria-label="Remove attachment"
            >
              ×
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <div class="input-row">
      <input
        bind:value={prompt}
        placeholder="Type a message..."
        disabled={chat.loading}
      />

      <input
        type="file"
        accept="image/*"
        multiple
        bind:this={fileInput}
        onchange={handleFileChange}
        style="display: none;"
      />
      <button
        type="button"
        class="file-btn"
        disabled={chat.loading}
        onclick={() => fileInput.click()}
        aria-label="Attach images"
      >
        Attach
      </button>

      {#if chat.loading}
        <button type="button" class="stop-btn" onclick={() => chat.abort()}>Stop</button>
      {:else}
        <button type="submit" disabled={!prompt.trim() && attachments.length === 0}>Send</button>
      {/if}
    </div>
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

  .msg-attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-bottom: 0.375rem;
  }

  .msg-image {
    max-width: 200px;
    max-height: 200px;
    object-fit: cover;
    border-radius: 0.375rem;
    display: block;
    margin-bottom: 0.375rem;
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
    padding-top: 0.75rem;
    border-top: 1px solid #e5e7eb;
  }

  .attachment-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .thumb-wrapper {
    position: relative;
    display: inline-block;
  }

  .thumb {
    width: 80px;
    height: 80px;
    object-fit: cover;
    border-radius: 0.375rem;
    border: 1px solid #d1d5db;
    display: block;
  }

  .remove-thumb {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #374151;
    color: white;
    border: none;
    font-size: 0.75rem;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .remove-thumb:hover { background: #111827; }

  .input-row {
    display: flex;
    gap: 0.5rem;
  }

  input:not([type]) {
    flex: 1;
    padding: 0.625rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.9375rem;
    outline: none;
    transition: border-color 0.15s;
  }

  input:not([type="file"]):focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
  }

  input:not([type="file"]):disabled {
    background: #f9fafb;
    color: #9ca3af;
  }

  .input-row button {
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

  .input-row button:hover:not(:disabled) { background: #4338ca; }
  .input-row button:disabled { opacity: 0.5; cursor: not-allowed; }

  .file-btn {
    background: white !important;
    color: #4f46e5 !important;
    border: 1px solid #4f46e5 !important;
  }

  .file-btn:hover:not(:disabled) {
    background: #eef2ff !important;
    color: #4338ca !important;
    border-color: #4338ca !important;
  }

  .stop-btn { background: #dc2626 !important; }
  .stop-btn:hover:not(:disabled) { background: #b91c1c !important; }
</style>
