<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		toolName: string;
		args: unknown;
		onApprove: () => void;
		onDeny: () => void;
		children?: Snippet<[{ toolName: string; args: unknown }]>;
		class?: string;
	}

	let {
		toolName,
		args,
		onApprove,
		onDeny,
		children,
		class: className = ''
	}: Props = $props();
</script>

<div class="svai-tool-approval {className}">
	{#if children}
		{@render children({ toolName, args })}
	{:else}
		<div class="svai-tool-approval__content">
			<p>Tool <strong>{toolName}</strong> wants to execute with:</p>
			<pre>{JSON.stringify(args, null, 2)}</pre>
			<div class="svai-tool-approval__actions">
				<button onclick={onApprove}>Approve</button>
				<button onclick={onDeny}>Deny</button>
			</div>
		</div>
	{/if}
</div>
