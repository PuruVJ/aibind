/**
 * A model identifier — either a string (gateway format like "anthropic/claude-sonnet-4")
 * or an AI SDK LanguageModel instance.
 */
export type LanguageModel = string | import('ai').LanguageModel;

// --- Stream types ---

export interface SendOptions {
	/** Override system prompt for this request */
	system?: string;
}

// --- Agent types ---

export interface AgentConfig {
	model?: LanguageModel;
	system: string;
	tools?: Record<string, import('ai').Tool>;
	/** When to stop the tool loop. Use AI SDK helpers like `stepCountIs(5)`. */
	stopWhen?: import('ai').StopCondition<any> | Array<import('ai').StopCondition<any>>;
}

export type AgentStatus = 'idle' | 'running' | 'awaiting-approval' | 'error';

export interface AgentMessage {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	type: 'text' | 'tool-call' | 'approval-request';
	toolName?: string;
	args?: unknown;
	result?: unknown;
}

// --- Utility types ---

/** Deep partial — makes all nested properties optional */
export type DeepPartial<T> = T extends object
	? { [P in keyof T]?: DeepPartial<T[P]> }
	: T;
