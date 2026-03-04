/**
 * A model identifier — either a string (gateway format like "anthropic/claude-sonnet-4")
 * or an AI SDK LanguageModel instance.
 */
export type LanguageModel = string | import("ai").LanguageModel;

// --- Stream types ---

export interface SendOptions {
  /** Override system prompt for this request */
  system?: string;
}

// --- Agent types ---

export type AgentStatus = "idle" | "running" | "awaiting-approval" | "error";

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  type: "text" | "tool-call" | "approval-request";
  toolName?: string;
  args?: unknown;
  result?: unknown;
}

export interface AgentOptions {
  /** API endpoint for the agent. Required — no default. */
  endpoint: string;
  /** Custom fetch implementation. Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
  onMessage?: (message: AgentMessage) => void;
  onError?: (error: Error) => void;
}

// --- Utility types ---

/** Deep partial — makes all nested properties optional */
export type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;
