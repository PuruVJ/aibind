import { useState, useEffect, useRef } from "react";
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
} from "@aibind/core";

export { defineModels } from "@aibind/core";
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
export { defaultDiff } from "@aibind/core";

// --- useUsageTracker ---

export interface UseUsageTrackerReturn {
  inputTokens: number;
  outputTokens: number;
  cost: number;
  turns: number;
  history: TurnUsage[];
  tracker: UsageTracker;
  reset: () => void;
}

/**
 * React hook for accumulating token usage and cost across stream turns.
 *
 * @example
 * ```tsx
 * const { tracker, inputTokens, cost } = useUsageTracker({
 *   pricing: { fast: { inputPerMillion: 0.15, outputPerMillion: 0.60 } },
 * });
 * const { send } = useStream({ model: "fast", tracker });
 * ```
 */
export function useUsageTracker(
  options: UsageTrackerOptions = {},
): UseUsageTrackerReturn {
  const [inputTokens, setInputTokens] = useState(0);
  const [outputTokens, setOutputTokens] = useState(0);
  const [cost, setCost] = useState(0);
  const [turns, setTurns] = useState(0);
  const [history, setHistory] = useState<TurnUsage[]>([]);

  const trackerRef = useRef<UsageTracker | null>(null);
  if (!trackerRef.current) {
    trackerRef.current = new UsageTracker({
      ...options,
      onUpdate: () => {
        const t = trackerRef.current!;
        setInputTokens(t.inputTokens);
        setOutputTokens(t.outputTokens);
        setCost(t.cost);
        setTurns(t.turns);
        setHistory([...t.history]);
        options.onUpdate?.();
      },
    });
  }

  return {
    inputTokens,
    outputTokens,
    cost,
    turns,
    history,
    tracker: trackerRef.current,
    reset: () => trackerRef.current!.reset(),
  };
}

// --- useCompletion ---

export interface CompletionOptions extends BaseCompletionOptions {}

export interface UseCompletionReturn {
  suggestion: string;
  loading: boolean;
  error: Error | null;
  update: (input: string) => void;
  accept: () => string;
  clear: () => void;
  abort: () => void;
}

/**
 * React hook for inline completions with debouncing and ghost-text state.
 */
export function useCompletion(
  options: CompletionOptions = {},
): UseCompletionReturn {
  const [suggestion, setSuggestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const ctrlRef = useRef<CompletionController | null>(null);

  if (!ctrlRef.current) {
    ctrlRef.current = new CompletionController(options, {
      onSuggestion: setSuggestion,
      onLoading: setLoading,
      onError: setError,
    } satisfies CompletionCallbacks);
  }

  useEffect(() => () => ctrlRef.current?.abort(), []);

  return {
    suggestion,
    loading,
    error,
    update: (input) => ctrlRef.current!.update(input),
    accept: () => ctrlRef.current!.accept(),
    clear: () => ctrlRef.current!.clear(),
    abort: () => ctrlRef.current!.abort(),
  };
}

// --- useStream ---

export interface UseStreamReturn<M extends string = string> {
  text: string;
  loading: boolean;
  error: Error | null;
  done: boolean;
  status: StreamStatus;
  streamId: string | null;
  canResume: boolean;
  model: M | undefined;
  setModel: (model: M) => void;
  usage: StreamUsage | null;
  diff: DiffChunk[] | null;
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
 * React hook for streaming text from an AI endpoint.
 *
 * @example
 * ```tsx
 * const { text, loading, send } = useStream({ endpoint: '/api/stream' });
 * ```
 */
export function useStream<M extends string = string>(
  options: StreamOptions<M>,
): UseStreamReturn<M> {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [done, setDone] = useState(false);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [streamId, setStreamId] = useState<string | null>(null);
  const [canResume, setCanResume] = useState(false);
  const [model, _setModel] = useState<M | undefined>(
    options.model as M | undefined,
  );
  const [usage, setUsage] = useState<StreamUsage | null>(null);
  const [diff, setDiff] = useState<DiffChunk[] | null>(null);

  const ctrlRef = useRef<StreamController | null>(null);

  if (!ctrlRef.current) {
    ctrlRef.current = new StreamController(options as StreamControllerOptions, {
      onText: setText,
      onLoading: setLoading,
      onDone: setDone,
      onError: setError,
      onStatus: setStatus,
      onStreamId: setStreamId,
      onCanResume: setCanResume,
      onUsage: setUsage,
      onDiff: setDiff,
    } satisfies StreamCallbacks);
  }

  useEffect(() => () => ctrlRef.current?.abort(), []);

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
      _setModel(value);
      ctrlRef.current!.setModel(value);
    },
    send: (prompt: string, sendOpts?: { system?: string; model?: M }) =>
      ctrlRef.current!.send(prompt, sendOpts),
    abort: () => ctrlRef.current!.abort(),
    retry: () => ctrlRef.current!.retry(),
    stop: () => ctrlRef.current!.stop(),
    resume: () => ctrlRef.current!.resume(),
    compact: (chat) => ctrlRef.current!.compact(chat),
  };
}

// --- useStructuredStream ---

export interface UseStructuredStreamReturn<T> {
  data: T | null;
  partial: DeepPartial<T> | null;
  raw: string;
  loading: boolean;
  error: Error | null;
  done: boolean;
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
 * React hook for streaming structured (JSON) output with partial updates.
 *
 * @example
 * ```tsx
 * const { data, partial, send } = useStructuredStream({
 *   endpoint: '/api/structured',
 *   schema: mySchema,
 * });
 * ```
 */
export function useStructuredStream<M extends string, T>(
  opts: StructuredStreamOptions<T, M>,
): UseStructuredStreamReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [partial, setPartial] = useState<DeepPartial<T> | null>(null);
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [done, setDone] = useState(false);

  const ctrlRef = useRef<StructuredStreamController<T> | null>(null);

  if (!ctrlRef.current) {
    ctrlRef.current = new StructuredStreamController<T>(
      opts as unknown as StructuredStreamControllerOptions<T>,
      {
        onText: setRaw,
        onLoading: setLoading,
        onDone: setDone,
        onError: setError,
        onStatus: () => {},
        onStreamId: () => {},
        onCanResume: () => {},
        onPartial: (p) => setPartial(p as DeepPartial<T> | null),
        onData: setData,
      } satisfies StructuredStreamCallbacks<T>,
    );
  }

  useEffect(() => () => ctrlRef.current?.abort(), []);

  return {
    data,
    partial,
    raw,
    loading,
    error,
    done,
    send: (prompt: string, sendOpts?: SendOptions) =>
      ctrlRef.current!.send(prompt, sendOpts),
    abort: () => ctrlRef.current!.abort(),
    retry: () => ctrlRef.current!.retry(),
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
  text: string;
  loading: boolean;
  error: Error | null;
  done: boolean;
  winner: M | null;
  send: (prompt: string, options?: { system?: string }) => void;
  abort: () => void;
}

/**
 * React hook for multi-model racing.
 * Sends the same prompt to all models simultaneously; the winner updates state.
 */
export function useRace<M extends string = string>(
  opts: RaceOptions<M>,
): UseRaceReturn<M> {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [done, setDone] = useState(false);
  const [winner, setWinner] = useState<M | null>(null);

  const ctrlRef = useRef<RaceController | null>(null);

  if (!ctrlRef.current) {
    ctrlRef.current = new RaceController(opts as RaceControllerOptions, {
      onText: setText,
      onLoading: setLoading,
      onDone: setDone,
      onError: setError,
      onWinner: (w) => setWinner(w as M | null),
    } satisfies RaceCallbacks);
  }

  useEffect(() => () => ctrlRef.current?.abort(), []);

  return {
    text,
    loading,
    error,
    done,
    winner,
    send: (prompt, options) => ctrlRef.current!.send(prompt, options),
    abort: () => ctrlRef.current!.abort(),
  };
}
