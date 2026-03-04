import type { z } from 'zod';

/**
 * A model identifier — either a string (gateway format like "anthropic/claude-sonnet-4")
 * or an AI SDK LanguageModel instance.
 */
export type LanguageModel = string | import('ai').LanguageModel;

/** Configuration for createAI */
export interface SvaiConfig {
	model: LanguageModel;
	/** Base URL for streaming endpoints. Default: '/api/svai' */
	baseUrl?: string;
}

/** Server-side configuration */
export interface ServerConfig {
	model: LanguageModel;
}

// --- Stream types ---

export interface UseStreamOptions {
	model?: LanguageModel;
	system?: string;
	/** Override the default streaming endpoint */
	endpoint?: string;
	onFinish?: (text: string) => void;
	onError?: (error: Error) => void;
}

export interface UseStreamReturn {
	readonly text: string;
	readonly loading: boolean;
	readonly error: Error | null;
	readonly done: boolean;
	send: (prompt: string) => void;
	abort: () => void;
	retry: () => void;
}

export interface UseStructuredStreamOptions<T> {
	schema: z.ZodType<T>;
	model?: LanguageModel;
	system?: string;
	endpoint?: string;
	onFinish?: (data: T) => void;
	onError?: (error: Error) => void;
}

export interface UseStructuredStreamReturn<T> {
	readonly data: T | null;
	readonly partial: Partial<T> | null;
	readonly raw: string;
	readonly loading: boolean;
	readonly error: Error | null;
	readonly done: boolean;
	send: (prompt: string) => void;
	abort: () => void;
	retry: () => void;
}

// --- Agent types ---

export interface AgentConfig {
	model?: LanguageModel;
	system: string;
	tools?: Record<string, import('ai').Tool>;
	maxSteps?: number;
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

export interface AgentState {
	readonly messages: AgentMessage[];
	readonly status: AgentStatus;
	readonly error: Error | null;
	readonly pendingApproval: { id: string; toolName: string; args: unknown } | null;
	send: (prompt: string) => void;
	approve: (id: string) => void;
	deny: (id: string, reason?: string) => void;
	stop: () => void;
}

// --- Plugin types ---

export interface SvaiPluginOptions {
	/** Base route path for streaming endpoints. Default: '/api/svai' */
	routePrefix?: string;
	/** Skip automatic route generation. Default: false */
	skipRouteGeneration?: boolean;
}

// --- Utility types ---

/** Deep partial — makes all nested properties optional */
export type DeepPartial<T> = T extends object
	? { [P in keyof T]?: DeepPartial<T[P]> }
	: T;
