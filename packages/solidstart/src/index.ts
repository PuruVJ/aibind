import {
  useStream as baseUseStream,
  useStructuredStream as baseUseStructuredStream,
  useChat as baseUseChat,
  useRace as baseUseRace,
  useCompletion as baseUseCompletion,
  type UseStreamReturn,
  type StreamOptions,
  type StructuredStreamOptions,
  type ChatOptions,
  type RaceOptions,
  type CompletionOptions,
  type UseChatReturn,
  type UseRaceReturn,
  type UseCompletionReturn,
} from "@aibind/solid";

export {
  defineModels,
  fileToAttachment,
  defaultDiff,
  useStreamMirror,
  useUsageTracker,
  useChatHistory,
  useProject,
} from "@aibind/solid";
export type {
  Attachment,
  ChatMessage,
  ChatSendOptions,
  StagedMessage,
  ChatOptions,
  DeepPartial,
  LanguageModel,
  RaceOptions,
  UseRaceReturn,
  CompletionOptions,
  UseCompletionReturn,
  SendOptions,
  StreamOptions,
  UseStreamReturn,
  StructuredStreamOptions,
  UseStructuredStreamReturn,
  UseChatReturn,
  UseStreamMirrorReturn,
  UseUsageTrackerReturn,
  UseChatHistoryReturn,
  UseProjectReturn,
  TreeConfig,
  ProjectConfig,
  ProjectConversation,
  StreamStatus,
  StreamUsage,
  DiffChunk,
  DiffFn,
  RaceStrategy,
  TurnUsage,
  UsageTrackerOptions,
} from "@aibind/solid";

const DEFAULT_PREFIX = "/__aibind__";

/**
 * Reactive streaming text hook with SolidStart defaults.
 * Endpoint defaults to `/__aibind__/stream`.
 */
export function useStream<M extends string = string>(
  options: Partial<Pick<StreamOptions<M>, "endpoint">> &
    Omit<StreamOptions<M>, "endpoint"> = {} as any,
): UseStreamReturn<M> {
  return baseUseStream({ endpoint: `${DEFAULT_PREFIX}/stream`, ...options });
}

/**
 * Reactive structured streaming hook with SolidStart defaults.
 * Endpoint defaults to `/__aibind__/structured`.
 */
export function useStructuredStream<M extends string, T>(
  options: Partial<Pick<StructuredStreamOptions<T, M>, "endpoint">> &
    Omit<StructuredStreamOptions<T, M>, "endpoint">,
): ReturnType<typeof baseUseStructuredStream<M, T>> {
  return baseUseStructuredStream({
    endpoint: `${DEFAULT_PREFIX}/structured`,
    ...options,
  });
}

/**
 * Multi-turn chat hook with SolidStart defaults.
 * Endpoint defaults to `/__aibind__/chat`.
 */
export function useChat(
  options: Partial<Pick<ChatOptions, "endpoint">> &
    Omit<ChatOptions, "endpoint"> = {} as any,
): UseChatReturn {
  return baseUseChat({ endpoint: `${DEFAULT_PREFIX}/chat`, ...options });
}

/**
 * Multi-model race hook with SolidStart defaults.
 * Endpoint defaults to `/__aibind__/stream`.
 */
export function useRace<M extends string = string>(
  options: Partial<Pick<RaceOptions<M>, "endpoint">> &
    Omit<RaceOptions<M>, "endpoint">,
): UseRaceReturn<M> {
  return baseUseRace({ endpoint: `${DEFAULT_PREFIX}/stream`, ...options });
}

/**
 * Inline completions hook with SolidStart defaults.
 * Endpoint defaults to `/__aibind__/complete`.
 */
export function useCompletion(
  options: Partial<Pick<CompletionOptions, "endpoint">> &
    Omit<CompletionOptions, "endpoint"> = {} as any,
): UseCompletionReturn {
  return baseUseCompletion({
    endpoint: `${DEFAULT_PREFIX}/complete`,
    ...options,
  });
}
