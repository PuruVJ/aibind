/**
 * Markdown recovery — detects and completes unterminated syntax
 * in streaming markdown. Allows graceful rendering of incomplete
 * markdown as it arrives from an AI stream.
 *
 * Inspired by Vercel's Remend library.
 */

interface RecoveryRule {
	detect: (text: string) => boolean;
	fix: (text: string) => string;
}

// --- Recovery regexes ---
const RE_FENCED_CODE_BLOCK = /(`{3,}|~{3,})[\s\S]*?\1/g;
const RE_INLINE_CODE = /`[^`]*`/g;
const RE_FENCE_OPEN = /^(`{3,}|~{3,})/gm;
const RE_LAST_FENCE = /(`{3,}|~{3,})[^\n]*$/m;
const RE_BOLD_STAR = /\*\*/g;
const RE_ITALIC_STAR = /\*/g;
const RE_BOLD_UNDER = /__/g;
const RE_ITALIC_UNDER = /_/g;
const RE_STRIKETHROUGH = /~~/g;
const RE_BACKTICK = /`/g;

/** Remove content inside fenced code blocks to avoid false matches. */
function removeCodeBlocks(text: string): string {
	return text.replace(RE_FENCED_CODE_BLOCK, '');
}

/** Remove all code content (blocks and inline) to avoid false matches. */
function removeCodeContent(text: string): string {
	let cleaned = removeCodeBlocks(text);
	cleaned = cleaned.replace(RE_INLINE_CODE, '');
	return cleaned;
}

const RULES: RecoveryRule[] = [
	// Unclosed fenced code block
	{
		detect(text) {
			const fences = text.match(RE_FENCE_OPEN);
			if (!fences) return false;
			return fences.length % 2 !== 0;
		},
		fix(text) {
			const match = text.match(RE_LAST_FENCE);
			const fence = match?.[1] ?? '```';
			return text + '\n' + fence;
		},
	},
	// Unclosed bold (**)
	{
		detect(text) {
			const cleaned = removeCodeContent(text);
			const matches = cleaned.match(RE_BOLD_STAR);
			return matches !== null && matches.length % 2 !== 0;
		},
		fix: (text) => text + '**',
	},
	// Unclosed italic (*)
	{
		detect(text) {
			const cleaned = removeCodeContent(text);
			const noBold = cleaned.replace(RE_BOLD_STAR, '');
			const matches = noBold.match(RE_ITALIC_STAR);
			return matches !== null && matches.length % 2 !== 0;
		},
		fix: (text) => text + '*',
	},
	// Unclosed bold (__)
	{
		detect(text) {
			const cleaned = removeCodeContent(text);
			const matches = cleaned.match(RE_BOLD_UNDER);
			return matches !== null && matches.length % 2 !== 0;
		},
		fix: (text) => text + '__',
	},
	// Unclosed italic (_)
	{
		detect(text) {
			const cleaned = removeCodeContent(text);
			const noDouble = cleaned.replace(RE_BOLD_UNDER, '');
			const matches = noDouble.match(RE_ITALIC_UNDER);
			return matches !== null && matches.length % 2 !== 0;
		},
		fix: (text) => text + '_',
	},
	// Unclosed strikethrough (~~)
	{
		detect(text) {
			const cleaned = removeCodeContent(text);
			const matches = cleaned.match(RE_STRIKETHROUGH);
			return matches !== null && matches.length % 2 !== 0;
		},
		fix: (text) => text + '~~',
	},
	// Unclosed inline code (`)
	{
		detect(text) {
			const cleaned = removeCodeBlocks(text);
			const matches = cleaned.match(RE_BACKTICK);
			return matches !== null && matches.length % 2 !== 0;
		},
		fix: (text) => text + '`',
	},
];

/**
 * MarkdownRecovery detects and fixes unterminated markdown syntax.
 *
 * Use this to make incomplete streaming markdown renderable by
 * appending missing closing markers.
 */
export class MarkdownRecovery {
	/**
	 * Apply recovery rules to fix unterminated markdown syntax.
	 * Returns the recovered text. If no recovery is needed, returns the original.
	 */
	static recover(text: string): string {
		let result = text;
		for (const rule of RULES) {
			if (rule.detect(result)) {
				result = rule.fix(result);
			}
		}
		return result;
	}

	/**
	 * Check if markdown text has any unterminated syntax.
	 */
	static hasUnterminated(text: string): boolean {
		return RULES.some((rule) => rule.detect(text));
	}
}
