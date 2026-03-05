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

export type StreamStatus =
  | "idle"
  | "streaming"
  | "stopped"
  | "done"
  | "reconnecting"
  | "disconnected"
  | "error";

// --- Agent types ---

export type AgentStatus = "idle" | "running" | "awaiting-approval" | "error";

export type ToolCallStatus = "running" | "completed" | "error";

export interface AgentMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  type: "text" | "tool-call" | "tool-result" | "approval-request";
  /** Tool call identifier (links tool-call and tool-result messages). */
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
  toolError?: string;
  toolStatus?: ToolCallStatus;
  /** Approval ID for approval-request messages. */
  approvalId?: string;
}

export interface AgentOptions {
  /** API endpoint for the agent. */
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

// --- defineModels ---

/**
 * Define named AI models for type-safe model selection across client and server.
 * Returns the same object with a phantom `$infer` type for extracting model keys.
 */
export function defineModels<const T extends Record<string, LanguageModel>>(
  models: T,
): T & { readonly $infer: Extract<keyof T, string> } {
  return models as T & { readonly $infer: Extract<keyof T, string> };
}
