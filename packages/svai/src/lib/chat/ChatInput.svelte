<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		chat: {
			sendMessage: (msg: { text: string }) => void;
			status: string;
		};
		placeholder?: string;
		button?: Snippet<[{ disabled: boolean }]>;
		class?: string;
	}

	let {
		chat,
		placeholder = 'Type a message...',
		button: buttonSnippet,
		class: className = ''
	}: Props = $props();

	let input = $state('');

	function handleSubmit(e: Event) {
		e.preventDefault();
		if (!input.trim()) return;
		chat.sendMessage({ text: input });
		input = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit(e);
		}
	}

	let isDisabled = $derived(chat.status === 'streaming' || !input.trim());
</script>

<form class="svai-input {className}" onsubmit={handleSubmit}>
	<textarea
		bind:value={input}
		{placeholder}
		onkeydown={handleKeydown}
		rows="1"
		disabled={chat.status === 'streaming'}
	></textarea>
	{#if buttonSnippet}
		{@render buttonSnippet({ disabled: isDisabled })}
	{:else}
		<button type="submit" disabled={isDisabled}>
			Send
		</button>
	{/if}
</form>
