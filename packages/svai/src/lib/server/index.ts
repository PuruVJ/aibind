import { query, command, form, getRequestEvent } from '$app/server';
import { generateText, Output } from 'ai';
import type { z } from 'zod';
import type { LanguageModel, ServerConfig } from '../types.js';

// Server-side model config (no runes — server-only module)
let _serverModel: LanguageModel | undefined;

/** Configure the default model for server-side AI helpers */
export function configureServer(config: ServerConfig): void {
	_serverModel = config.model;
}

/** Get the configured server model, with optional override */
export function getServerModel(override?: LanguageModel | string): LanguageModel {
	if (override) return override;
	if (!_serverModel) {
		throw new Error(
			'svai/server: No model configured. Call configureServer({ model: ... }) first.'
		);
	}
	return _serverModel;
}

function resolveModel(override?: LanguageModel): LanguageModel {
	return getServerModel(override);
}

// --- aiQuery ---

/** Simple text query: input -> prompt string -> AI text response */
export function aiQuery<Input>(
	inputSchema: z.ZodType<Input>,
	promptFn: (input: Input) => string | Promise<string>
): ReturnType<typeof query>;

/** Structured output query: input -> prompt -> typed AI response */
export function aiQuery<Input, OutputType>(config: {
	input: z.ZodType<Input>;
	output: z.ZodType<OutputType>;
	prompt: (input: Input) => string | Promise<string>;
	system?: string;
	model?: LanguageModel;
}): ReturnType<typeof query>;

export function aiQuery(
	inputOrConfig:
		| z.ZodType<unknown>
		| {
				input: z.ZodType<unknown>;
				output: z.ZodType<unknown>;
				prompt: (input: unknown) => string | Promise<string>;
				system?: string;
				model?: LanguageModel;
		  },
	promptFn?: (input: unknown) => string | Promise<string>
) {
	if (promptFn) {
		// Simple overload: aiQuery(schema, fn) -> text
		const schema = inputOrConfig as z.ZodType<unknown>;
		return query(schema, async (input: unknown) => {
			const prompt = await promptFn(input);
			const model = resolveModel();
			const result = await generateText({ model, prompt });
			return result.text;
		});
	} else {
		// Structured overload: aiQuery({ input, output, prompt, ... })
		const config = inputOrConfig as {
			input: z.ZodType<unknown>;
			output: z.ZodType<unknown>;
			prompt: (input: unknown) => string | Promise<string>;
			system?: string;
			model?: LanguageModel;
		};
		return query(config.input, async (input: unknown) => {
			const prompt = await config.prompt(input);
			const model = resolveModel(config.model);
			const result = await generateText({
				model,
				prompt,
				system: config.system,
				output: Output.object({ schema: config.output })
			});
			return result.output;
		});
	}
}

// --- aiCommand ---

/**
 * AI-powered mutation. Wraps SvelteKit's command() with injected model and event.
 * The handler has full control over AI SDK calls.
 */
export function aiCommand<Input, Result>(
	inputSchema: z.ZodType<Input>,
	handler: (input: Input, ctx: { model: LanguageModel; event: ReturnType<typeof getRequestEvent> }) => Promise<Result>
) {
	// Use type assertion — SvelteKit's command() generics have strict contravariance
	// that doesn't compose well with our wrapper, but the runtime types are correct
	return command(inputSchema as never, async (input: never) => {
		const model = resolveModel();
		const event = getRequestEvent();
		return handler(input as Input, { model, event });
	});
}

// --- aiForm ---

/**
 * AI-powered form with progressive enhancement.
 * Wraps SvelteKit's form() with injected model and event.
 */
export function aiForm<Input extends Record<string, unknown>, Result>(
	inputSchema: z.ZodType<Input>,
	handler: (
		data: Input,
		ctx: { model: LanguageModel; event: ReturnType<typeof getRequestEvent>; issue: unknown }
	) => Promise<Result>
) {
	// Use type assertion — SvelteKit's form() requires RemoteFormInput which
	// is narrower than generic Record<string, unknown>
	return form(inputSchema as never, async (data: never, issue: Record<string | number, unknown>) => {
		const model = resolveModel();
		const event = getRequestEvent();
		return handler(data as Input, { model, event, issue });
	});
}

export type { LanguageModel, ServerConfig } from '../types.js';
