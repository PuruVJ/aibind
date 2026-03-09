import {
  Stream as BaseStream,
  StructuredStream as BaseStructuredStream,
  Chat as BaseChat,
  Race as BaseRace,
  defineModels,
  type StreamOptions,
  type StructuredStreamOptions,
  type ChatOptions,
  type RaceOptions,
} from "@aibind/svelte";

export {
  defineModels,
  fileToAttachment,
  StreamMirror,
  Completion,
} from "@aibind/svelte";
export type {
  Attachment,
  BroadcastMessage,
  ChatMessage,
  ChatSendOptions,
  StagedMessage,
  ChatOptions,
  RaceOptions,
  CompletionOptions,
  SendOptions,
  DeepPartial,
  LanguageModel,
  StreamOptions,
  StreamStatus,
  StructuredStreamOptions,
} from "@aibind/svelte";

const DEFAULT_PREFIX = "/__aibind__";

/**
 * Reactive streaming text with SvelteKit defaults.
 * Endpoint defaults to `/__aibind__/stream`.
 */
export class Stream<M extends string = string> extends BaseStream<M> {
  constructor(
    options: Partial<Pick<StreamOptions<M>, "endpoint">> &
      Omit<StreamOptions<M>, "endpoint"> = {} as any,
  ) {
    super({ endpoint: `${DEFAULT_PREFIX}/stream`, ...options });
  }
}

/**
 * Reactive structured streaming with SvelteKit defaults.
 * Endpoint defaults to `/__aibind__/structured`.
 */
export class StructuredStream<M extends string, T> extends BaseStructuredStream<
  M,
  T
> {
  constructor(
    options: Partial<Pick<StructuredStreamOptions<T, M>, "endpoint">> &
      Omit<StructuredStreamOptions<T, M>, "endpoint">,
  ) {
    super({ endpoint: `${DEFAULT_PREFIX}/structured`, ...options });
  }
}

/**
 * Reactive conversational chat with SvelteKit defaults.
 * Endpoint defaults to `/__aibind__/chat`.
 */
export class Chat extends BaseChat {
  constructor(
    options: Partial<Pick<ChatOptions, "endpoint">> &
      Omit<ChatOptions, "endpoint"> = {} as any,
  ) {
    super({ endpoint: `${DEFAULT_PREFIX}/chat`, ...options });
  }
}

/**
 * Reactive multi-model race with SvelteKit defaults.
 * Endpoint defaults to `/__aibind__/stream`.
 */
export class Race<M extends string = string> extends BaseRace<M> {
  constructor(
    options: Partial<Pick<RaceOptions<M>, "endpoint">> &
      Omit<RaceOptions<M>, "endpoint">,
  ) {
    super({ endpoint: `${DEFAULT_PREFIX}/stream`, ...options });
  }
}
