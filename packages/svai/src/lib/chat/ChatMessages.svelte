<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		chat: {
			messages: Array<{ id: string; role: string; parts: Array<{ type: string; text?: string; toolName?: string; state?: string; result?: unknown; args?: unknown }> }>;
			status: string;
			error?: Error;
		};
		message?: Snippet<[{ id: string; role: string; parts: Array<{ type: string; text?: string; toolName?: string; state?: string; result?: unknown; args?: unknown }> }]>;
		loading?: Snippet;
		error?: Snippet<[Error]>;
		class?: string;
	}

	let {
		chat,
		message: messageSnippet,
		loading: loadingSnippet,
		error: errorSnippet,
		class: className = ''
	}: Props = $props();
</script>

<div class="svai-messages {className}">
	{#each chat.messages as msg (msg.id)}
		{#if messageSnippet}
			{@render messageSnippet(msg)}
		{:else}
			<div class="svai-message svai-message--{msg.role}">
				{#each msg.parts as part, i (i)}
					{#if part.type === 'text' && part.text}
						<p>{part.text}</p>
					{:else if part.type === 'tool-invocation' && part.toolName}
						<div class="svai-tool">
							<span class="svai-tool__name">{part.toolName}</span>
							{#if part.state === 'result'}
								<pre class="svai-tool__result">{JSON.stringify(part.result, null, 2)}</pre>
							{:else}
								<span class="svai-tool__pending">Running...</span>
							{/if}
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	{/each}

	{#if chat.status === 'streaming' || chat.status === 'submitted'}
		{#if loadingSnippet}
			{@render loadingSnippet()}
		{:else}
			<div class="svai-loading">Thinking...</div>
		{/if}
	{/if}

	{#if chat.error}
		{#if errorSnippet}
			{@render errorSnippet(chat.error)}
		{:else}
			<div class="svai-error">{chat.error.message}</div>
		{/if}
	{/if}
</div>
