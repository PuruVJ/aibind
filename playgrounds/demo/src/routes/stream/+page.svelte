<script lang="ts">
	import { Stream } from '@aibind/sveltekit';

	const stream = new Stream({
		system: 'You are a helpful assistant. Keep responses concise.',
		model: 'gpt',
	});

	let prompt = $state('');
</script>

<h1>Stream Demo</h1>

<form
	onsubmit={(e) => {
		e.preventDefault();
		stream.send(prompt);
		prompt = '';
	}}
>
	<input bind:value={prompt} placeholder="Ask something..." />
	<button type="submit" disabled={stream.loading}>
		{stream.loading ? 'Streaming...' : 'Send'}
	</button>
	{#if stream.loading}
		<button type="button" onclick={() => stream.abort()}>Stop</button>
	{/if}
</form>

{#if stream.text}
	<div class="response" class:streaming={stream.loading}>
		{stream.text}{#if stream.loading}▌{/if}
	</div>
{/if}

{#if stream.error}
	<div class="error">
		<p>{stream.error.message}</p>
		<button onclick={() => stream.retry()}>Retry</button>
	</div>
{/if}

<style>
	form {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	input {
		flex: 1;
		padding: 0.5rem;
	}
	.response {
		padding: 1rem;
		background: #f9fafb;
		border-radius: 0.5rem;
		white-space: pre-wrap;
	}
	.streaming {
		opacity: 0.8;
	}
	.error {
		color: #dc2626;
		padding: 1rem;
	}
</style>
