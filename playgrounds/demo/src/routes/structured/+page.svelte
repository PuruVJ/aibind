<script lang="ts">
	import { StructuredStream } from '@aibind/svelte';
	import { z } from 'zod/v4';

	const AnalysisSchema = z.object({
		sentiment: z.enum(['positive', 'negative', 'neutral']),
		score: z.number(),
		topics: z.array(z.string()),
		summary: z.string(),
	});

	const analysis = new StructuredStream({
		schema: AnalysisSchema,
		system: 'You are a sentiment analysis expert. Return valid JSON matching the schema.',
	});

	let text = $state('');
</script>

<h1>StructuredStream Demo</h1>

<form
	onsubmit={(e) => {
		e.preventDefault();
		analysis.send(`Analyze this text: ${text}`);
	}}
>
	<textarea bind:value={text} placeholder="Paste text to analyze..." rows="4"></textarea>
	<button type="submit" disabled={analysis.loading}>
		{analysis.loading ? 'Analyzing...' : 'Analyze'}
	</button>
</form>

{#if analysis.partial}
	<div class="result" class:loading={analysis.loading}>
		{#if analysis.partial.sentiment}
			<p><strong>Sentiment:</strong> {analysis.partial.sentiment}</p>
		{/if}
		{#if analysis.partial.score != null}
			<p><strong>Score:</strong> {analysis.partial.score}</p>
		{/if}
		{#if analysis.partial.summary}
			<p><strong>Summary:</strong> {analysis.partial.summary}</p>
		{/if}
		{#if analysis.partial.topics?.length}
			<p><strong>Topics:</strong> {analysis.partial.topics.join(', ')}</p>
		{/if}
	</div>
{/if}

{#if analysis.error}
	<div class="error">
		<p>{analysis.error.message}</p>
		<button onclick={() => analysis.retry()}>Retry</button>
	</div>
{/if}

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	textarea {
		padding: 0.5rem;
	}
	.result {
		padding: 1rem;
		background: #f9fafb;
		border-radius: 0.5rem;
	}
	.loading {
		opacity: 0.7;
	}
	.error {
		color: #dc2626;
		padding: 1rem;
	}
</style>
