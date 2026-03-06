# Pattern: Model Race UI

Send the same prompt to multiple models simultaneously. Show a live indicator while they compete, then reveal the winner's response as it streams in.

```svelte
<script lang="ts">
  import { Race } from "@aibind/sveltekit";

  const race = new Race({
    models: ["fast", "smart", "reason"],
    strategy: "first-token", // commit to whoever responds first
  });

  let prompt = $state("");
</script>

<input bind:value={prompt} />
<button onclick={() => race.send(prompt)} disabled={race.loading}>Race</button>

<!-- Competitor status -->
{#if race.loading || race.winner}
  <div class="competitors">
    {#each ["fast", "smart", "reason"] as model}
      <div
        class="competitor"
        class:winner={race.winner === model}
        class:racing={race.loading && !race.winner}
      >
        <span>{model}</span>
        {#if race.winner === model}
          <span class="badge">winner</span>
        {:else if race.winner && race.winner !== model}
          <span class="badge lost">cancelled</span>
        {:else}
          <span class="badge pending">racing…</span>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<!-- Winner's response streams live -->
{#if race.text}
  <p>{race.text}</p>
{/if}
```

## Key Patterns

### Choose the right strategy

```ts
// "first-token" — lowest perceived latency.
// Commits to whoever responds first and streams their output live.
const race = new Race({ models: ["fast", "smart"], strategy: "first-token" });

// "complete" — lowest actual latency.
// Waits for whoever finishes first, then shows the full response at once.
const race = new Race({ models: ["fast", "smart"], strategy: "complete" });
```

`"first-token"` feels faster because text starts appearing immediately. `"complete"` is useful when you want the objectively shortest total wait without a streaming effect.

### Track which model wins most

```ts
const wins: Record<string, number> = {};

const race = new Race({
  models: ["fast", "smart"],
  strategy: "first-token",
  onFinish: (text, winner) => {
    wins[winner] = (wins[winner] ?? 0) + 1;
    console.log(`Win rates:`, wins);
  },
});
```

### Race with token tracking

Combine with `UsageTracker` to measure the cost of always racing:

```ts
const tracker = new UsageTracker({
  pricing: {
    fast: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
    smart: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  },
});

// tracker only records the winner — losers are aborted before completion
// so you're only billed for the winner's tokens
const race = new Race({
  models: ["fast", "smart"],
  strategy: "first-token",
  tracker,
});
```

### Fallback on all failures

`onError` fires only if every model fails:

```ts
const race = new Race({
  models: ["fast", "smart"],
  onError: (err) => {
    console.error("All models failed:", err);
  },
});
```
