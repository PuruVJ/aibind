<script lang="ts">
	import { StreamParser, HtmlRenderer, MarkdownRecovery } from '@aibind/markdown';

	interface Props {
		/** The markdown text to render. Can grow over time during streaming. */
		text: string;
		/** Whether the text is still streaming. Enables recovery for unterminated syntax. */
		streaming?: boolean;
		/** CSS class for the wrapper element. */
		class?: string;
	}

	let { text, streaming = false, class: className = '' }: Props = $props();

	const renderer = new HtmlRenderer();
	const parser = new StreamParser(renderer);

	let html = $derived.by(() => {
		const input = streaming ? MarkdownRecovery.recover(text) : text;
		renderer.reset();
		parser.reset();
		parser.write(input);
		parser.end();
		return renderer.html;
	});
</script>

<div class="stream-markdown {className}" class:streaming>{@html html}</div>
