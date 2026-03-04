<script lang="ts">
	import { Stream } from '@aibind/sveltekit';
	import { ReactiveChatHistory } from '@aibind/sveltekit/history';

	interface ChatMessage {
		role: 'user' | 'assistant';
		content: string;
	}

	const chat = new ReactiveChatHistory<ChatMessage>();
	const stream = new Stream({
		system: 'You are a helpful assistant. Keep responses concise (2-3 sentences max).',
		model: 'gpt',
	});

	let prompt = $state('');
	let editingId: string | null = $state(null);
	let editText = $state('');
	let streamingNodeId: string | null = $state(null);
	let regeneratingNodeId: string | null = $state(null);

	function formatPrompt(messages: ChatMessage[]): string {
		return messages
			.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
			.join('\n');
	}

	function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		const text = prompt.trim();
		if (!text || stream.loading) return;
		sendMessage(text);
		prompt = '';
	}

	function sendMessage(text: string) {
		chat.append({ role: 'user', content: text });
		streamingNodeId = 'pending';
		regeneratingNodeId = null;

		const allMessages = chat.messages;
		const formatted = formatPrompt(allMessages);
		stream.send(formatted);
	}

	function startEdit(nodeId: string, content: string) {
		editingId = nodeId;
		editText = content;
	}

	function submitEdit(nodeId: string) {
		const newContent = editText.trim();
		if (!newContent) return;

		chat.edit(nodeId, { role: 'user', content: newContent });
		editingId = null;
		editText = '';

		streamingNodeId = 'pending';
		regeneratingNodeId = null;

		const allMessages = chat.messages;
		const formatted = formatPrompt(allMessages);
		stream.send(formatted);
	}

	function handleRegenerate(nodeId: string) {
		if (stream.loading) return;

		regeneratingNodeId = nodeId;
		streamingNodeId = null;

		const nodeIndex = chat.nodeIds.indexOf(nodeId);
		const messagesUpToParent = chat.messages.slice(0, nodeIndex);
		const formatted = formatPrompt(messagesUpToParent);
		stream.send(formatted);
	}

	$effect(() => {
		if (stream.done && stream.text) {
			if (regeneratingNodeId) {
				chat.regenerate(regeneratingNodeId, { role: 'assistant', content: stream.text });
				regeneratingNodeId = null;
			} else if (streamingNodeId) {
				chat.append({ role: 'assistant', content: stream.text });
				streamingNodeId = null;
			}
		}
	});
</script>

<div class="container">
	<header>
		<h1>Branching Chat</h1>
		<p class="subtitle">Edit messages, regenerate responses, and navigate conversation branches.</p>
	</header>

	<div class="messages">
		{#each chat.messages as msg, i (chat.nodeIds[i])}
			{@const nodeId = chat.nodeIds[i]}
			<div class="message {msg.role}">
				{#if chat.hasAlternatives(nodeId)}
					<div class="branch-nav">
						<button
							onclick={() => chat.prevAlternative(nodeId)}
							disabled={chat.alternativeIndex(nodeId) === 0}
						>
							&larr;
						</button>
						<span class="branch-index">
							{chat.alternativeIndex(nodeId) + 1}/{chat.alternativeCount(nodeId)}
						</span>
						<button
							onclick={() => chat.nextAlternative(nodeId)}
							disabled={chat.alternativeIndex(nodeId) === chat.alternativeCount(nodeId) - 1}
						>
							&rarr;
						</button>
					</div>
				{/if}

				<span class="role-label">{msg.role === 'user' ? 'You' : 'Assistant'}</span>

				{#if editingId === nodeId}
					<form
						onsubmit={(e) => {
							e.preventDefault();
							submitEdit(nodeId);
						}}
					>
						<textarea bind:value={editText} rows={2}></textarea>
						<div class="edit-actions">
							<button type="submit">Save & Send</button>
							<button
								type="button"
								onclick={() => {
									editingId = null;
								}}>Cancel</button
							>
						</div>
					</form>
				{:else}
					<div class="content">{msg.content}</div>
					<div class="actions">
						{#if msg.role === 'user'}
							<button class="action-btn" onclick={() => startEdit(nodeId, msg.content)}>
								Edit
							</button>
						{:else}
							<button class="action-btn" onclick={() => handleRegenerate(nodeId)}>
								Regenerate
							</button>
						{/if}
					</div>
				{/if}
			</div>
		{/each}

		{#if stream.loading}
			<div class="message assistant streaming-message">
				<span class="role-label">Assistant</span>
				<div class="content">
					{#if stream.text}
						{stream.text}<span class="cursor">&#9612;</span>
					{:else}
						<span class="streaming-indicator"></span>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	{#if stream.error}
		<div class="error">
			<strong>Error:</strong>
			{stream.error.message}
		</div>
	{/if}

	<form class="input-form" onsubmit={handleSubmit}>
		<input bind:value={prompt} placeholder="Type a message..." disabled={stream.loading} />
		{#if stream.loading}
			<button type="button" class="stop-btn" onclick={() => stream.abort()}>Stop</button>
		{:else}
			<button type="submit" disabled={!prompt.trim()}>Send</button>
		{/if}
	</form>
</div>

<style>
	.container {
		display: flex;
		flex-direction: column;
		min-height: 60vh;
	}

	header {
		margin-bottom: 1.5rem;
	}

	h1 {
		margin: 0 0 0.25rem;
		font-size: 1.5rem;
	}

	.subtitle {
		margin: 0;
		color: #6b7280;
		font-size: 0.875rem;
	}

	.messages {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding-bottom: 1rem;
	}

	.message {
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		max-width: 85%;
		position: relative;
	}

	.message.user {
		background: #dbeafe;
		align-self: flex-end;
		border-bottom-right-radius: 0.125rem;
	}

	.message.assistant {
		background: #f3f4f6;
		align-self: flex-start;
		border-bottom-left-radius: 0.125rem;
	}

	.role-label {
		display: block;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.25rem;
		color: #6b7280;
	}

	.content {
		white-space: pre-wrap;
		word-break: break-word;
		font-size: 0.9375rem;
		line-height: 1.5;
	}

	/* Branch navigation */
	.branch-nav {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		margin-bottom: 0.5rem;
	}

	.branch-nav button {
		padding: 0.125rem 0.375rem;
		font-size: 0.75rem;
		background: rgba(0, 0, 0, 0.06);
		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: 0.25rem;
		cursor: pointer;
		color: #374151;
		line-height: 1;
	}

	.branch-nav button:hover:not(:disabled) {
		background: rgba(0, 0, 0, 0.1);
	}

	.branch-nav button:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.branch-index {
		font-size: 0.7rem;
		color: #6b7280;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}

	/* Action buttons */
	.actions {
		margin-top: 0.375rem;
		opacity: 0;
		transition: opacity 0.15s;
	}

	.message:hover .actions {
		opacity: 1;
	}

	.action-btn {
		padding: 0.2rem 0.5rem;
		font-size: 0.7rem;
		background: transparent;
		border: 1px solid #d1d5db;
		border-radius: 0.25rem;
		color: #6b7280;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}

	.action-btn:hover {
		background: #f3f4f6;
		color: #374151;
	}

	/* Edit mode */
	textarea {
		width: 100%;
		padding: 0.5rem;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		font-size: 0.9375rem;
		font-family: inherit;
		resize: vertical;
		outline: none;
		transition: border-color 0.15s;
	}

	textarea:focus {
		border-color: #6366f1;
		box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
	}

	.edit-actions {
		display: flex;
		gap: 0.375rem;
		margin-top: 0.375rem;
	}

	.edit-actions button {
		padding: 0.3rem 0.625rem;
		font-size: 0.75rem;
		border: none;
		border-radius: 0.25rem;
		cursor: pointer;
		font-weight: 500;
	}

	.edit-actions button[type='submit'] {
		background: #4f46e5;
		color: white;
	}

	.edit-actions button[type='submit']:hover {
		background: #4338ca;
	}

	.edit-actions button[type='button'] {
		background: #e5e7eb;
		color: #374151;
	}

	.edit-actions button[type='button']:hover {
		background: #d1d5db;
	}

	/* Streaming indicator */
	.streaming-indicator {
		display: inline-block;
		width: 8px;
		height: 8px;
		background: #6366f1;
		border-radius: 50%;
		animation: pulse 1s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 0.4;
			transform: scale(0.8);
		}
		50% {
			opacity: 1;
			transform: scale(1.2);
		}
	}

	.cursor {
		animation: blink 0.6s step-end infinite;
		color: #6366f1;
	}

	@keyframes blink {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0;
		}
	}

	/* Error */
	.error {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		margin-bottom: 0.75rem;
		font-size: 0.875rem;
	}

	/* Input form */
	.input-form {
		display: flex;
		gap: 0.5rem;
		padding-top: 0.75rem;
		border-top: 1px solid #e5e7eb;
	}

	input {
		flex: 1;
		padding: 0.625rem 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		font-size: 0.9375rem;
		outline: none;
		transition: border-color 0.15s;
	}

	input:focus {
		border-color: #6366f1;
		box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
	}

	input:disabled {
		background: #f9fafb;
		color: #9ca3af;
	}

	.input-form button {
		padding: 0.625rem 1.25rem;
		border: none;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
		background: #4f46e5;
		color: white;
	}

	.input-form button:hover:not(:disabled) {
		background: #4338ca;
	}

	.input-form button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.stop-btn {
		background: #dc2626 !important;
	}

	.stop-btn:hover {
		background: #b91c1c !important;
	}
</style>
