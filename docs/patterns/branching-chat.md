# Pattern: Branching Chat

Let users edit any past message and explore alternative conversations. Each edit creates a sibling branch — the original is preserved and users can navigate between versions.

```svelte
<script lang="ts">
  import { Stream } from "@aibind/sveltekit";
  import { ChatHistory } from "@aibind/sveltekit/history";

  type Msg = { role: "user" | "assistant"; content: string };

  const chat = new ChatHistory<Msg>();

  // pendingRegenId: set before a regenerate send so onFinish knows to branch
  let pendingRegenId: string | null = null;

  const stream = new Stream({
    model: "smart",
    onFinish: (text) => {
      if (pendingRegenId) {
        chat.regenerate(pendingRegenId, { role: "assistant", content: text });
        pendingRegenId = null;
      } else {
        chat.append({ role: "assistant", content: text });
      }
    },
  });

  let prompt = $state("");

  function send() {
    if (!prompt.trim() || stream.loading) return;
    chat.append({ role: "user", content: prompt });
    stream.send(prompt);
    prompt = "";
  }
</script>

{#each chat.messages as msg, i}
  <div class="msg {msg.role}">
    <p>{msg.content}</p>

    <!-- Edit button on user messages -->
    {#if msg.role === "user"}
      <button onclick={() => editMessage(chat.nodeIds[i], msg.content)}
        >Edit</button
      >
    {/if}

    <!-- Regenerate + sibling navigation on assistant messages -->
    {#if msg.role === "assistant"}
      <button onclick={() => regenerate(chat.nodeIds[i])}>Regenerate</button>
      {#if chat.hasAlternatives(chat.nodeIds[i])}
        <button onclick={() => chat.prevAlternative(chat.nodeIds[i])}>←</button>
        <span
          >{chat.alternativeIndex(chat.nodeIds[i]) + 1} / {chat.alternativeCount(
            chat.nodeIds[i],
          )}</span
        >
        <button onclick={() => chat.nextAlternative(chat.nodeIds[i])}>→</button>
      {/if}
    {/if}
  </div>
{/each}

{#if stream.loading}
  <div class="msg assistant"><p>{stream.text}</p></div>
{/if}

<input bind:value={prompt} onkeydown={(e) => e.key === "Enter" && send()} />
```

## Key Patterns

### Edit a user message

Editing creates a new sibling branch — the original message is preserved.

```ts
function editMessage(nodeId: string, original: string) {
  const newContent = prompt(`Edit message:`, original);
  if (!newContent || newContent === original) return;

  // Creates a sibling branch at this node
  chat.edit(nodeId, { role: "user", content: newContent });

  // Re-send from the new branch's perspective
  stream.send(newContent);
}
```

### Regenerate an assistant response

```ts
function regenerate(nodeId: string) {
  const idx = chat.nodeIds.indexOf(nodeId);
  const userMsg = chat.messages[idx - 1];

  // onFinish sees pendingRegenId and branches instead of appending
  pendingRegenId = nodeId;
  stream.send(userMsg.content);
}
```

### Navigate between alternatives

Once a node has siblings (from edits or regenerates), navigate with:

```ts
chat.prevAlternative(nodeId);
chat.nextAlternative(nodeId);

// Check state
chat.hasAlternatives(nodeId); // boolean
chat.alternativeIndex(nodeId); // 0-based current index
chat.alternativeCount(nodeId); // total siblings
```

Navigating automatically updates `chat.messages` — the view re-renders to show the selected branch.

### Persist and restore

```ts
// Save the full tree including all branches
localStorage.setItem("chat", chat.toJSON());

// Restore later
const saved = localStorage.getItem("chat");
if (saved) chat = ChatHistory.fromJSON(saved);
```
