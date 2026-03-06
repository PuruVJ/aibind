import { useState, useEffect, useRef } from "react";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import {
  StreamController,
  StructuredStreamController,
  CompletionController,
  type StreamCallbacks,
  type StreamControllerOptions,
  type StructuredStreamCallbacks,
  type StructuredStreamControllerOptions,
  type StreamStatus,
  type StreamUsage,
  type SendOptions,
  type DeepPartial,
  type BaseStreamOptions,
  type BaseCompletionOptions,
  type CompletionCallbacks,
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
  BaseCompletionOptions,
} from "@aibind/core";

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
export function useCompletion(options: CompletionOptions = {}): UseCompletionReturn {
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
