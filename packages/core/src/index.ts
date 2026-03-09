// Artifact types (detectors live in @aibind/core/artifact subpath)
export type {
  Artifact,
  ArtifactDetector,
  ArtifactLineResult,
} from "./artifacts";

// Broadcast
export type { BroadcastMessage } from "./broadcast";
export { StreamBroadcastReceiver } from "./broadcast";

// Shared types
export { defineModels } from "./types";
export { routeByLength } from "./routing";
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
  CompletionCallbacks,
  BaseCompletionOptions,
  UsageRecorder,
  DiffChunk,
  DiffFn,
} from "./types";

// Diff utilities
export { defaultDiff } from "./diff";

export { ServerAgent } from "./server-agent";
export type { AgentConfig, RunOptions } from "./server-agent";
export { AgentGraph } from "./agent-graph";
export type { AgentNodeConfig, RouterFn } from "./agent-graph";
export { consumeTextStream } from "./stream-utils";
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

// Usage tracking
export { UsageTracker } from "./usage-tracker";
export type {
  ModelPricing,
  TurnUsage,
  UsageTrackerOptions,
} from "./usage-tracker";

// Completion controller (framework-agnostic)
export { CompletionController } from "./completion-controller";

// Race controller (multi-model racing)
export { RaceController } from "./race-controller";
export type {
  RaceCallbacks,
  RaceControllerOptions,
  RaceStrategy,
} from "./race-controller";

// Stream controllers (framework-agnostic)
export { BaseStreamController } from "./base-stream-controller";
export type {
  BaseStreamCallbacks,
  BaseStreamControllerOptions,
} from "./base-stream-controller";
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
  CompleteRequestBody,
  ChatRequestBody,
} from "./stream-handler";

// Chat controller (framework-agnostic client)
export { ChatController } from "./chat-controller";
export { fileToAttachment } from "./file-to-attachment";
export type {
  ChatMessage,
  ChatCallbacks,
  BaseChatOptions,
  StagedMessage,
  Attachment,
  ChatSendOptions,
} from "./types";

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
