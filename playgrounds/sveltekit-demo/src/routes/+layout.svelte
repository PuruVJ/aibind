<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<nav>
	<a href="/">Home</a>
	<a href="/stream">Stream</a>
	<a href="/structured">Structured</a>
	<a href="/agent">Agent</a>
	<a href="/query">Query</a>
	<a href="/markdown">Markdown</a>
	<a href="/branching">Branching</a>
	<a href="/resumable">Resumable</a>
</nav>

<main>
	{@render children()}
</main>

<style>
	nav {
		display: flex;
		gap: 1rem;
		padding: 1rem;
		border-bottom: 1px solid #e5e7eb;
	}
	nav a {
		color: #4f46e5;
		text-decoration: none;
	}
	nav a:hover {
		text-decoration: underline;
	}
	main {
		padding: 1rem;
		max-width: 48rem;
		margin: 0 auto;
	}
</style>
