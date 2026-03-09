import {
  useStream as baseUseStream,
  useStructuredStream as baseUseStructuredStream,
  type StreamOptions,
  type StructuredStreamOptions,
  type UseStreamReturn,
} from "@aibind/vue";

export {
  defineModels,
  useStreamMirror,
  useChat,
  useRace,
  useCompletion,
} from "@aibind/vue";
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
  StructuredStreamOptions,
  UseChatReturn,
  UseStreamMirrorReturn,
} from "@aibind/vue";

const DEFAULT_PREFIX = "/__aibind__";

/**
 * Reactive streaming text composable with Nuxt defaults.
 * Endpoint defaults to `/__aibind__/stream`.
 */
export function useStream<M extends string = string>(
  options: Partial<Pick<StreamOptions<M>, "endpoint">> &
    Omit<StreamOptions<M>, "endpoint"> = {} as any,
): UseStreamReturn<M> {
  return baseUseStream({ endpoint: `${DEFAULT_PREFIX}/stream`, ...options });
}

/**
 * Reactive structured streaming composable with Nuxt defaults.
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
