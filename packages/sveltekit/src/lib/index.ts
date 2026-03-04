import {
  Stream as BaseStream,
  StructuredStream as BaseStructuredStream,
  defineModels,
  type StreamOptions,
  type StructuredStreamOptions,
} from "@aibind/svelte";

export { defineModels } from "@aibind/svelte";
export type {
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
