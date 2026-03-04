<script lang="ts">
	import { Chat } from '@ai-sdk/svelte';
	import { ChatMessages, ChatInput } from 'svai/chat';

	const chat = new Chat({});
</script>

<h1>Chat Demo</h1>

<ChatMessages {chat} />
<ChatInput {chat} placeholder="Ask me anything..." />

<style>
	:global(.svai-messages) {
		min-height: 300px;
		max-height: 500px;
		overflow-y: auto;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		padding: 1rem;
		margin-bottom: 1rem;
	}
	:global(.svai-message--user) { text-align: right; color: #4f46e5; }
	:global(.svai-message--assistant) { text-align: left; }
	:global(.svai-input) { display: flex; gap: 0.5rem; }
	:global(.svai-input textarea) { flex: 1; padding: 0.5rem; }
</style>
