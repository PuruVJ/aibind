# Pattern: Writing Assistant

Ghost-text completions in a textarea — the AI predicts the next sentence as the user types. Tab to accept, keep typing to dismiss.

```svelte
<script lang="ts">
  import { Completion } from "@aibind/sveltekit";
  import { StreamMarkdown } from "@aibind/sveltekit/markdown";

  const completion = new Completion({
    model: "fast",
    debounce: 400,
    system:
      "Complete the user's writing. Return only the continuation — no preamble.",
  });

  let text = $state("");
</script>

<div class="editor">
  <textarea
    bind:value={text}
    oninput={() => completion.update(text)}
    onkeydown={(e) => {
      if (e.key === "Tab" && completion.suggestion) {
        text = completion.accept();
        e.preventDefault();
      }
      if (e.key === "Escape") completion.clear();
    }}
    placeholder="Start writing..."
  />

  <!-- Ghost text overlay: current text + dimmed suggestion tail -->
  {#if completion.suggestion}
    <div class="ghost" aria-hidden="true">
      <span>{text}</span><span class="dim">{completion.suggestion}</span>
    </div>
  {/if}
</div>

<!-- Live markdown preview -->
<StreamMarkdown {text} />
```

## Key Patterns

### Debounce tuning

Lower debounce = more responsive, more requests. Tune per use case:

```ts
// Search box — fast feedback
const completion = new Completion({ model: "fast", debounce: 200 });

// Long-form writing — wait for a pause
const completion = new Completion({ model: "smart", debounce: 600 });
```

### Accept partial suggestion

`accept()` returns `input + suggestion` and clears ghost text. Assign it back to your bound value:

```ts
// Accept full suggestion on Tab
if (e.key === "Tab") {
  text = completion.accept();
  e.preventDefault();
}
```

### System prompt shapes completions

The system prompt controls what the AI continues. Tune it for your context:

```ts
// Code editor
const completion = new Completion({
  model: "fast",
  system: "Complete the code. Return only the next tokens — no explanation.",
});

// Search box
const completion = new Completion({
  model: "fast",
  system: "Complete the search query. Return only the completion.",
});
```

### Loading indicator

```svelte
{#if completion.loading}
  <span class="spinner" />
{/if}
```
