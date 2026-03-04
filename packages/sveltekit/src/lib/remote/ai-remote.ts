import { query, command, getRequestEvent } from '$app/server';
import { generateText, Output } from 'ai';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { LanguageModel } from '@aibind/svelte';

/**
 * Server-side AI helper that wraps SvelteKit remote functions.
 * Each instance holds its own model — no global state.
 */
export class AIRemote {
	#model: LanguageModel;

	constructor(model: LanguageModel) {
		this.#model = model;
	}

	/** Simple text query: input → prompt → AI text response */
	query<Input>(
		schema: StandardSchemaV1<unknown, Input>,
		promptFn: (input: Input) => string | Promise<string>
	) {
		const model = this.#model;
		return query(schema, async (input: unknown) => {
			const prompt = await promptFn(input as Input);
			const result = await generateText({ model, prompt });
			return result.text;
		});
	}

	/** Structured output query: input → prompt → typed AI response */
	structuredQuery<Input, OutputType>(config: {
		input: StandardSchemaV1<unknown, Input>;
		output: StandardSchemaV1<unknown, OutputType>;
		prompt: (input: Input) => string | Promise<string>;
		system?: string;
	}) {
		const model = this.#model;
		return query(config.input, async (input: unknown) => {
			const prompt = await config.prompt(input as Input);
			const result = await generateText({
				model,
				prompt,
				system: config.system,
				output: Output.object({ schema: config.output as never })
			});
			return result.output;
		});
	}

	/** AI-powered mutation. Handler receives validated input plus { model, event }. */
	command<Input, Result>(
		schema: StandardSchemaV1<unknown, Input>,
		handler: (
			input: Input,
			ctx: { model: LanguageModel; event: ReturnType<typeof getRequestEvent> }
		) => Promise<Result>
	) {
		const model = this.#model;
		return command(schema as never, async (input: never) => {
			const event = getRequestEvent();
			return handler(input as Input, { model, event });
		});
	}
}
