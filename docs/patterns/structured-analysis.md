# Pattern: Structured Analysis

Use structured output to build type-safe analysis tools with real-time partial results.

## SvelteKit Implementation

```svelte
<script lang="ts">
  import { StructuredStream } from '@aibind/sveltekit';
  import { z } from 'zod/v4';

  const ReviewSchema = z.object({
    sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']),
    confidence: z.number().min(0).max(1),
    topics: z.array(z.object({
      name: z.string(),
      sentiment: z.enum(['positive', 'negative', 'neutral']),
    })),
    summary: z.string(),
    actionItems: z.array(z.string()).optional(),
  });

  const review = new StructuredStream({
    schema: ReviewSchema,
    model: 'smart',
    system: 'Analyze the given review. Be thorough and objective.',
  });

  let input = $state('');
</script>

<textarea bind:value={input} placeholder="Paste a review..." rows="6" />
<button onclick={() => review.send(`Analyze: ${input}`)} disabled={review.loading}>
  {review.loading ? 'Analyzing...' : 'Analyze'}
</button>

{#if review.partial}
  <div class="results">
    {#if review.partial.sentiment}
      <div class="badge" class:positive={review.partial.sentiment === 'positive'}
           class:negative={review.partial.sentiment === 'negative'}>
        {review.partial.sentiment}
        {#if review.partial.confidence != null}
          ({(review.partial.confidence * 100).toFixed(0)}%)
        {/if}
      </div>
    {/if}

    {#if review.partial.topics?.length}
      <h3>Topics</h3>
      <ul>
        {#each review.partial.topics as topic}
          <li>{topic.name} — {topic.sentiment}</li>
        {/each}
      </ul>
    {/if}

    {#if review.partial.summary}
      <h3>Summary</h3>
      <p>{review.partial.summary}</p>
    {/if}

    {#if review.partial.actionItems?.length}
      <h3>Action Items</h3>
      <ul>
        {#each review.partial.actionItems as item}
          <li>{item}</li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
```

## Key Patterns

### Schema Design

- Use `z.enum()` for categorical values — they resolve first and can be shown immediately
- Put arrays last — they fill in progressively
- Optional fields with `.optional()` appear only when the AI decides to include them

### Partial Rendering

The `partial` property is `DeepPartial<T>` — every field is potentially `undefined`. Always use optional chaining:

```ts
review.partial?.topics?.length; // Safe
review.partial.topics.length; // May crash during streaming
```

### Error Recovery

If the AI generates invalid JSON that doesn't match your schema, `error` is set with validation details:

```svelte
{#if review.error}
  <p class="error">{review.error.message}</p>
  <button onclick={() => review.retry()}>Retry</button>
{/if}
```
