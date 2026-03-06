// Shared types
export { defineModels } from "./types";
export type {
  LanguageModel,
  SendOptions,
  BaseStreamOptions,
  StreamStatus,
  StreamUsage,
  AgentStatus,
  ToolCallStatus,
  AgentMessage,
  AgentOptions,
  DeepPartial,
} from "./types";

export { ServerAgent } from "./server-agent";
export type { AgentConfig, RunOptions } from "./server-agent";
export { consumeTextStream, parsePartialJSON } from "./stream-utils";
export { MessageTree } from "./message-tree";
export type {
  TreeNode,
  TreeConfig,
  SerializedTree,
  TreePath,
} from "./message-tree";
export { ChatHistory } from "./chat-history";

// Durable streams (abort + resume)
export type {
  StreamStore,
  StreamChunk,
  DurableStreamStatus,
} from "./stream-store";
export { MemoryStreamStore } from "./memory-store";
export { SSE } from "./sse";
export type { SSEMessage } from "./sse";
export { DurableStream } from "./durable-stream";
export type { DurableStreamOptions, ResumeOptions } from "./durable-stream";

// Stream controllers (framework-agnostic)
export { StreamController } from "./stream-controller";
export type {
  StreamCallbacks,
  StreamControllerOptions,
} from "./stream-controller";
export { StructuredStreamController } from "./structured-stream-controller";
export type {
  StructuredStreamCallbacks,
  StructuredStreamControllerOptions,
} from "./structured-stream-controller";

// Conversation history store (server-side sessions)
export type {
  ConversationStore,
  ConversationMessage,
} from "./conversation-store";
export { MemoryConversationStore } from "./memory-conversation-store";

// Stream handler (framework-agnostic server handler)
export { createStreamHandler, StreamHandler } from "./stream-handler";
export type {
  StreamHandlerConfig,
  ConversationConfig,
  StreamRequestBody,
  StructuredStreamRequestBody,
  CompactRequestBody,
  StopRequestBody,
} from "./stream-handler";

// Agent controller (framework-agnostic)
export { AgentController } from "./agent-controller";
export type { AgentCallbacks } from "./agent-controller";

// Agent stream (NDJSON tool calling protocol)
export { AgentStream } from "./agent-stream";
export type { AgentStreamEvent } from "./agent-stream";

// Projects (context management)
export { Project } from "./project";
export type {
  ProjectConfig,
  ProjectConversation,
  SerializedProject,
} from "./project";
