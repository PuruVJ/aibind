import { ref, onUnmounted } from "vue";
import type { Ref } from "vue";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import {
  StreamController,
  StructuredStreamController,
  type StreamCallbacks,
  type StreamControllerOptions,
  type StructuredStreamCallbacks,
  type StructuredStreamControllerOptions,
  type StreamStatus,
  type StreamUsage,
  type SendOptions,
  type DeepPartial,
  type BaseStreamOptions,
  type ChatHistory,
  type ConversationMessage,
} from "@aibind/core";

export { defineModels } from "@aibind/core";
export type {
  SendOptions,
  DeepPartial,
  LanguageModel,
  StreamStatus,
  StreamUsage,
  BaseStreamOptions,
} from "@aibind/core";

// --- useStream ---

export interface UseStreamReturn<M extends string = string> {
  text: Ref<string>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  done: Ref<boolean>;
  status: Ref<StreamStatus>;
  streamId: Ref<string | null>;
  canResume: Ref<boolean>;
  model: Ref<M | undefined>;
  usage: Ref<StreamUsage | null>;
  setModel: (model: M) => void;
  send: (prompt: string, sendOpts?: { system?: string; model?: M }) => void;
  abort: () => void;
  retry: () => void;
  stop: () => Promise<void>;
  resume: () => Promise<void>;
  compact: (chat: ChatHistory<ConversationMessage>) => Promise<{ tokensSaved: number }>;
}

export interface StreamOptions<
  M extends string = string,
> extends BaseStreamOptions {
  model?: M;
  routeModel?: (prompt: string) => M | Promise<M>;
}

/**
 * Reactive streaming text composable.
 * Call inside a component's `setup()` — lifecycle is tied to the component.
 */
export function useStream<M extends string = string>(
  options: StreamOptions<M>,
): UseStreamReturn<M> {
  const text = ref("");
  const loading = ref(false);
  const error: Ref<Error | null> = ref(null);
  const done = ref(false);
  const status: Ref<StreamStatus> = ref("idle");
  const streamId: Ref<string | null> = ref(null);
  const canResume = ref(false);
  const model = ref(options.model) as Ref<M | undefined>;
  const usage: Ref<StreamUsage | null> = ref(null);

  const ctrl = new StreamController(options as StreamControllerOptions, {
    onText: (t) => {
      text.value = t;
    },
    onLoading: (l) => {
      loading.value = l;
    },
    onDone: (d) => {
      done.value = d;
    },
    onError: (e) => {
      error.value = e;
    },
    onStatus: (s) => {
      status.value = s;
    },
    onStreamId: (id) => {
      streamId.value = id;
    },
    onCanResume: (c) => {
      canResume.value = c;
    },
    onUsage: (u) => {
      usage.value = u;
    },
  } satisfies StreamCallbacks);

  onUnmounted(() => ctrl.abort());

  return {
    text,
    loading,
    error,
    done,
    status,
    streamId,
    canResume,
    model,
    usage,
    setModel: (value: M) => {
      model.value = value;
      ctrl.setModel(value);
    },
    send: (prompt: string, sendOpts?: { system?: string; model?: M }) =>
      ctrl.send(prompt, sendOpts),
    abort: () => ctrl.abort(),
    retry: () => ctrl.retry(),
    stop: () => ctrl.stop(),
    resume: () => ctrl.resume(),
    compact: (chat) => ctrl.compact(chat),
  };
}

// --- useStructuredStream ---

export interface UseStructuredStreamReturn<T> {
  data: Ref<T | null>;
  partial: Ref<DeepPartial<T> | null>;
  raw: Ref<string>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  done: Ref<boolean>;
  send: (prompt: string, sendOpts?: SendOptions) => void;
  abort: () => void;
  retry: () => void;
}

export interface StructuredStreamOptions<T, M extends string = string> {
  model?: M;
  schema: StandardSchemaV1<unknown, T>;
  system?: string;
  endpoint: string;
  fetch?: typeof globalThis.fetch;
  onFinish?: (data: T) => void;
  onError?: (error: Error) => void;
}

/**
 * Reactive structured streaming composable.
 * Streams JSON and parses partial objects as they arrive.
 * Validates the final result with any Standard Schema-compatible library.
 */
export function useStructuredStream<M extends string, T>(
  opts: StructuredStreamOptions<T, M>,
): UseStructuredStreamReturn<T> {
  const data: Ref<T | null> = ref(null);
  const partial: Ref<DeepPartial<T> | null> = ref(null);
  const raw = ref("");
  const loading = ref(false);
  const error: Ref<Error | null> = ref(null);
  const done = ref(false);

  const ctrl = new StructuredStreamController<T>(
    opts as unknown as StructuredStreamControllerOptions<T>,
    {
      onText: (t) => {
        raw.value = t;
      },
      onLoading: (l) => {
        loading.value = l;
      },
      onDone: (d) => {
        done.value = d;
      },
      onError: (e) => {
        error.value = e;
      },
      onStatus: () => {},
      onStreamId: () => {},
      onCanResume: () => {},
      onPartial: (p) => {
        partial.value = p as DeepPartial<T> | null;
      },
      onData: (d) => {
        data.value = d;
      },
    } satisfies StructuredStreamCallbacks<T>,
  );

  onUnmounted(() => ctrl.abort());

  return {
    data,
    partial,
    raw,
    loading,
    error,
    done,
    send: (prompt: string, sendOpts?: SendOptions) =>
      ctrl.send(prompt, sendOpts),
    abort: () => ctrl.abort(),
    retry: () => ctrl.retry(),
  };
}
