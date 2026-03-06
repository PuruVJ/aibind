import { createSignal, onCleanup } from "solid-js";
import type { Accessor } from "solid-js";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import {
  StreamController,
  StructuredStreamController,
  CompletionController,
  RaceController,
  UsageTracker,
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
  inputTokens: Accessor<number>;
  outputTokens: Accessor<number>;
  cost: Accessor<number>;
  turns: Accessor<number>;
  history: Accessor<TurnUsage[]>;
  tracker: UsageTracker;
  reset: () => void;
}

/**
 * SolidJS hook for accumulating token usage and cost across stream turns.
 */
export function useUsageTracker(
  options: UsageTrackerOptions = {},
): UseUsageTrackerReturn {
  const [inputTokens, setInputTokens] = createSignal(0);
  const [outputTokens, setOutputTokens] = createSignal(0);
  const [cost, setCost] = createSignal(0);
  const [turns, setTurns] = createSignal(0);
  const [history, setHistory] = createSignal<TurnUsage[]>([]);

  const tracker = new UsageTracker({
    ...options,
    onUpdate: () => {
      setInputTokens(tracker.inputTokens);
      setOutputTokens(tracker.outputTokens);
      setCost(tracker.cost);
      setTurns(tracker.turns);
      setHistory([...tracker.history]);
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
  suggestion: Accessor<string>;
  loading: Accessor<boolean>;
  error: Accessor<Error | null>;
  update: (input: string) => void;
  accept: () => string;
  clear: () => void;
  abort: () => void;
}

/**
 * SolidJS hook for inline completions with debouncing and ghost-text state.
 */
export function useCompletion(
  options: CompletionOptions = {},
): UseCompletionReturn {
  const [suggestion, setSuggestion] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);

  const ctrl = new CompletionController(options, {
    onSuggestion: setSuggestion,
    onLoading: setLoading,
    onError: setError,
  } satisfies CompletionCallbacks);

  onCleanup(() => ctrl.abort());

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
  text: Accessor<string>;
  loading: Accessor<boolean>;
  error: Accessor<Error | null>;
  done: Accessor<boolean>;
  status: Accessor<StreamStatus>;
  streamId: Accessor<string | null>;
  canResume: Accessor<boolean>;
  model: Accessor<M | undefined>;
  usage: Accessor<StreamUsage | null>;
  diff: Accessor<DiffChunk[] | null>;
  setModel: (model: M) => void;
  send: (prompt: string, options?: { system?: string; model?: M }) => void;
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
 * Reactive streaming text hook.
 * Call inside a component — lifecycle is tied to the component.
 */
export function useStream<M extends string = string>(
  options: StreamOptions<M>,
): UseStreamReturn<M> {
  const [text, setText] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  const [done, setDone] = createSignal(false);
  const [status, setStatus] = createSignal<StreamStatus>("idle");
  const [streamId, setStreamId] = createSignal<string | null>(null);
  const [canResume, setCanResume] = createSignal(false);
  const [model, _setModel] = createSignal<M | undefined>(
    options.model as M | undefined,
  );
  const [usage, setUsage] = createSignal<StreamUsage | null>(null);
  const [diff, setDiff] = createSignal<DiffChunk[] | null>(null);

  const ctrl = new StreamController(options as StreamControllerOptions, {
    onText: (t) => setText(t),
    onLoading: (l) => setLoading(l),
    onDone: (d) => setDone(d),
    onError: (e) => setError(e),
    onStatus: (s) => setStatus(s),
    onStreamId: (id) => setStreamId(id),
    onCanResume: (c) => setCanResume(c),
    onUsage: (u) => setUsage(() => u),
    onDiff: (chunks) => setDiff(() => chunks),
  } satisfies StreamCallbacks);

  onCleanup(() => ctrl.abort());

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
    setModel: (value: M) => {
      _setModel(() => value);
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
  data: Accessor<T | null>;
  partial: Accessor<DeepPartial<T> | null>;
  raw: Accessor<string>;
  loading: Accessor<boolean>;
  error: Accessor<Error | null>;
  done: Accessor<boolean>;
  send: (prompt: string, options?: SendOptions) => void;
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
 * Reactive structured streaming hook.
 * Streams JSON and parses partial objects as they arrive.
 * Validates the final result with any Standard Schema-compatible library.
 */
export function useStructuredStream<M extends string, T>(
  opts: StructuredStreamOptions<T, M>,
): UseStructuredStreamReturn<T> {
  const [data, setData] = createSignal<T | null>(null);
  const [partial, setPartial] = createSignal<DeepPartial<T> | null>(null);
  const [raw, setRaw] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  const [done, setDone] = createSignal(false);

  const ctrl = new StructuredStreamController<T>(
    opts as unknown as StructuredStreamControllerOptions<T>,
    {
      onText: (t) => setRaw(t),
      onLoading: (l) => setLoading(l),
      onDone: (d) => setDone(d),
      onError: (e) => setError(e),
      onStatus: () => {},
      onStreamId: () => {},
      onCanResume: () => {},
      onPartial: (p) => setPartial(() => p as DeepPartial<T> | null),
      onData: (d) => setData(() => d),
    } satisfies StructuredStreamCallbacks<T>,
  );

  onCleanup(() => ctrl.abort());

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
  text: Accessor<string>;
  loading: Accessor<boolean>;
  error: Accessor<Error | null>;
  done: Accessor<boolean>;
  winner: Accessor<M | null>;
  send: (prompt: string, options?: { system?: string }) => void;
  abort: () => void;
}

/**
 * SolidJS hook for multi-model racing.
 * Sends the same prompt to all models simultaneously; the winner updates signals.
 */
export function useRace<M extends string = string>(
  opts: RaceOptions<M>,
): UseRaceReturn<M> {
  const [text, setText] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  const [done, setDone] = createSignal(false);
  const [winner, setWinner] = createSignal<M | null>(null);

  const ctrl = new RaceController(opts as RaceControllerOptions, {
    onText: (t) => setText(t),
    onLoading: (l) => setLoading(l),
    onDone: (d) => setDone(d),
    onError: (e) => setError(e),
    onWinner: (w) => setWinner(() => w as M | null),
  } satisfies RaceCallbacks);

  onCleanup(() => ctrl.abort());

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
