# Pattern: Cost-Aware Chat

Route prompts to cheaper models automatically by length, track spend in real time, and let users see exactly what each response cost.

```svelte
<script lang="ts">
  import { Stream, UsageTracker } from "@aibind/sveltekit";
  import { routeByLength } from "@aibind/core";

  const tracker = new UsageTracker({
    pricing: {
      fast: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
      smart: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
      reason: { inputPerMillion: 1.25, outputPerMillion: 10.0 },
    },
  });

  const stream = new Stream({
    tracker,
    routeModel: routeByLength(
      [
        { maxLength: 200, model: "fast" },
        { maxLength: 800, model: "smart" },
      ],
      "reason",
    ),
  });

  let prompt = $state("");
</script>

<div class="stats">
  <span>{tracker.inputTokens + tracker.outputTokens} tokens</span>
  <span>${tracker.cost.toFixed(4)} spent</span>
  <span>{tracker.turns} turns</span>
  <button onclick={() => tracker.reset()}>Reset</button>
</div>

<input bind:value={prompt} />
<button onclick={() => stream.send(prompt)}>Send</button>
<p>{stream.text}</p>
```

## Key Patterns

### Route by prompt length

`routeByLength` matches rules in ascending order — first rule where `prompt.length <= maxLength` wins:

```ts
routeByLength(
  [
    { maxLength: 200, model: "fast" }, // quick questions
    { maxLength: 800, model: "smart" }, // normal prompts
  ],
  "reason",
); // fallback for long/complex
```

### Per-turn cost breakdown

```svelte
{#each tracker.history as turn}
  <div>
    <span>{turn.model}</span>
    <span>{turn.inputTokens}in / {turn.outputTokens}out</span>
    <span>${turn.cost.toFixed(5)}</span>
  </div>
{/each}
```

### Override routing for a single send

`routeModel` is skipped when `model` is passed explicitly:

```ts
// Always use smart for this one, regardless of length
stream.send("Quick question?", { model: "smart" });
```

### Async router — route by user tier

```ts
const stream = new Stream({
  tracker,
  routeModel: async (prompt) => {
    const tier = await getUserTier();
    if (tier === "pro") return prompt.length < 200 ? "fast" : "smart";
    return "fast"; // free tier always gets fast
  },
});
```

### Budget alerts

```svelte
{#if tracker.cost > 1.0}
  <p class="warning">You've spent over $1 this session.</p>
{/if}
```
