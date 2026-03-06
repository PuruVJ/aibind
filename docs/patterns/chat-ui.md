# Pattern: Chat UI

Build a full chat interface with streaming, message history, branching, and markdown rendering.

## SvelteKit Implementation

```svelte
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";
  import { ChatHistory } from "@aibind/sveltekit/history";
  import { StreamMarkdown } from "@aibind/sveltekit/markdown";

  type Msg = { role: "user" | "assistant"; content: string };

  const chat = new ChatHistory<Msg>();
  const stream = new Stream({
    model: "smart",
    system: "You are a helpful assistant.",
    onFinish: (text) => {
      chat.append({ role: "assistant", content: text });
    },
  });

  let prompt = $state("");

  function handleSend() {
    if (!prompt.trim()) return;
    chat.append({ role: "user", content: prompt });
    stream.send(prompt);
    prompt = "";
  }
</script>

<div class="chat">
  {#each chat.messages as msg, i}
    <div class="message {msg.role}">
      <strong>{msg.role}</strong>

      {#if msg.role === "assistant"}
        <StreamMarkdown text={msg.content} />
      {:else}
        <p>{msg.content}</p>
      {/if}

      {#if chat.hasAlternatives(chat.nodeIds[i])}
        <div class="alternatives">
          <button onclick={() => chat.prevAlternative(chat.nodeIds[i])}
            >←</button
          >
          <span>
            {chat.alternativeIndex(chat.nodeIds[i]) + 1}
            / {chat.alternativeCount(chat.nodeIds[i])}
          </span>
          <button onclick={() => chat.nextAlternative(chat.nodeIds[i])}
            >→</button
          >
        </div>
      {/if}
    </div>
  {/each}

  {#if stream.loading}
    <div class="message assistant streaming">
      <strong>assistant</strong>
      <StreamMarkdown text={stream.text} streaming={true} />
    </div>
  {/if}
</div>

<form
  onsubmit={(e) => {
    e.preventDefault();
    handleSend();
  }}
>
  <input bind:value={prompt} placeholder="Type a message..." />
  <button type="submit" disabled={stream.loading}>Send</button>
</form>
```

## Key Patterns

### 1. Separate stream from history

The `Stream` handles the active streaming response. When it finishes (`onFinish`), append the completed message to `ChatHistory`. This gives you full branching support.

### 2. Edit messages

```ts
function editMessage(nodeId: string, newContent: string) {
  chat.edit(nodeId, { role: "user", content: newContent });
  // Re-send to AI with the updated context
  const messages = chat.messages;
  stream.send(messages[messages.length - 1].content);
}
```

### 3. Regenerate responses

```ts
function regenerate(nodeId: string) {
  // Find the user message before this response
  const idx = chat.nodeIds.indexOf(nodeId);
  const userMsg = chat.messages[idx - 1];
  stream.send(userMsg.content, {
    onFinish: (text) => {
      chat.regenerate(nodeId, { role: "assistant", content: text });
    },
  });
}
```

### 4. Persist conversations

```ts
// Save
localStorage.setItem("chat", chat.toJSON());

// Restore
const saved = localStorage.getItem("chat");
if (saved) {
  const restored = ChatHistory.fromJSON(saved);
}
```
