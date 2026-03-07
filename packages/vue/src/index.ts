import { ref, computed, onUnmounted } from "vue";
import type { Ref, ComputedRef } from "vue";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import {
  StreamController,
  StructuredStreamController,
  CompletionController,
  RaceController,
  UsageTracker,
  type Artifact,
  type StreamCallbacks,
  type StreamControllerOptions,
  type StructuredStreamCallbacks,
  type StructuredStreamControllerOptions,
  type RaceCallbacks,
  type RaceControllerOptions,
  type RaceStrategy,
  type StreamStatus,
  type StreamUsage,
  type SendOptions,
  type DeepPartial,
  type BaseStreamOptions,
  type BaseCompletionOptions,
  type CompletionCallbacks,
  type ChatHistory,
  type ConversationMessage,
  type TurnUsage,
  type UsageTrackerOptions,
  type DiffChunk,
} from "@aibind/core";

export { defineModels, defaultDiff } from "@aibind/core";
export type {
  Artifact,
  ArtifactDetector,
  ArtifactLineResult,
  SendOptions,
  DeepPartial,
  LanguageModel,
  StreamStatus,
  StreamUsage,
  BaseStreamOptions,
  BaseCompletionOptions,
  UsageRecorder,
  ModelPricing,
  TurnUsage,
  UsageTrackerOptions,
  DiffChunk,
  DiffFn,
  RaceStrategy,
} from "@aibind/core";

// --- useUsageTracker ---

export interface UseUsageTrackerReturn {
  inputTokens: Ref<number>;
  outputTokens: Ref<number>;
  cost: Ref<number>;
  turns: Ref<number>;
  history: Ref<TurnUsage[]>;
  tracker: UsageTracker;
  reset: () => void;
}

/**
 * Vue composable for accumulating token usage and cost across stream turns.
 */
export function useUsageTracker(
  options: UsageTrackerOptions = {},
): UseUsageTrackerReturn {
  const inputTokens = ref(0);
  const outputTokens = ref(0);
  const cost = ref(0);
  const turns = ref(0);
  const history: Ref<TurnUsage[]> = ref([]);

  const tracker = new UsageTracker({
    ...options,
    onUpdate: () => {
      inputTokens.value = tracker.inputTokens;
      outputTokens.value = tracker.outputTokens;
      cost.value = tracker.cost;
      turns.value = tracker.turns;
      history.value = [...tracker.history];
      options.onUpdate?.();
    },
  });

  return {
    inputTokens,
    outputTokens,
    cost,
    turns,
    history,
    tracker,
    reset: () => tracker.reset(),
  };
}

// --- useCompletion ---

export interface CompletionOptions extends BaseCompletionOptions {}

export interface UseCompletionReturn {
  suggestion: Ref<string>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  update: (input: string) => void;
  accept: () => string;
  clear: () => void;
  abort: () => void;
}

/**
 * Vue composable for inline completions with debouncing and ghost-text state.
 */
export function useCompletion(
  options: CompletionOptions = {},
): UseCompletionReturn {
  const suggestion = ref("");
  const loading = ref(false);
  const error: Ref<Error | null> = ref(null);

  const ctrl = new CompletionController(options, {
    onSuggestion: (s) => {
      suggestion.value = s;
    },
    onLoading: (l) => {
      loading.value = l;
    },
    onError: (e) => {
      error.value = e;
    },
  } satisfies CompletionCallbacks);

  onUnmounted(() => ctrl.abort());

  return {
    suggestion,
    loading,
    error,
    update: (input) => ctrl.update(input),
    accept: () => ctrl.accept(),
    clear: () => ctrl.clear(),
    abort: () => ctrl.abort(),
  };
}

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
  diff: Ref<DiffChunk[] | null>;
  artifacts: Ref<Artifact[]>;
  activeArtifact: ComputedRef<Artifact | null>;
  setModel: (model: M) => void;
  send: (prompt: string, sendOpts?: { system?: string; model?: M }) => void;
  abort: () => void;
  retry: () => void;
  stop: () => Promise<void>;
  resume: () => Promise<void>;
  compact: (
    chat: ChatHistory<ConversationMessage>,
  ) => Promise<{ tokensSaved: number }>;
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
  const diff: Ref<DiffChunk[] | null> = ref(null);
  const artifacts: Ref<Artifact[]> = ref([]);
  const activeArtifact = computed<Artifact | null>(
    () => artifacts.value.findLast((a) => !a.complete) ?? null,
  );

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
    onDiff: (chunks) => {
      diff.value = chunks;
    },
    onArtifacts: (arts) => {
      artifacts.value = arts;
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
    diff,
    artifacts,
    activeArtifact,
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

// --- useRace ---

export interface RaceOptions<M extends string = string> {
  models: M[];
  endpoint: string;
  system?: string;
  strategy?: RaceStrategy;
  fetch?: typeof globalThis.fetch;
  onFinish?: (text: string, winner: M) => void;
  onError?: (error: Error) => void;
}

export interface UseRaceReturn<M extends string = string> {
  text: Ref<string>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  done: Ref<boolean>;
  winner: Ref<M | null>;
  send: (prompt: string, options?: { system?: string }) => void;
  abort: () => void;
}

/**
 * Vue composable for multi-model racing.
 * Sends the same prompt to all models simultaneously; the winner updates refs.
 */
export function useRace<M extends string = string>(
  opts: RaceOptions<M>,
): UseRaceReturn<M> {
  const text = ref("");
  const loading = ref(false);
  const error: Ref<Error | null> = ref(null);
  const done = ref(false);
  const winner: Ref<M | null> = ref(null);

  const ctrl = new RaceController(opts as RaceControllerOptions, {
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
    onWinner: (w) => {
      winner.value = w as M | null;
    },
  } satisfies RaceCallbacks);

  onUnmounted(() => ctrl.abort());

  return {
    text,
    loading,
    error,
    done,
    winner,
    send: (prompt, options) => ctrl.send(prompt, options),
    abort: () => ctrl.abort(),
  };
}
