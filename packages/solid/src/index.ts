import { createSignal, onCleanup } from "solid-js";
import type { Accessor } from "solid-js";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import {
  StreamController,
  StructuredStreamController,
  type StreamCallbacks,
  type StreamControllerOptions,
  type StructuredStreamCallbacks,
  type StructuredStreamControllerOptions,
  type StreamStatus,
  type SendOptions,
  type DeepPartial,
} from "@aibind/core";

export { defineModels } from "@aibind/core";
export type {
  SendOptions,
  DeepPartial,
  LanguageModel,
  StreamStatus,
} from "@aibind/core";

// --- useStream ---

export interface UseStreamReturn {
  text: Accessor<string>;
  loading: Accessor<boolean>;
  error: Accessor<Error | null>;
  done: Accessor<boolean>;
  status: Accessor<StreamStatus>;
  streamId: Accessor<string | null>;
  canResume: Accessor<boolean>;
  send: (prompt: string, options?: SendOptions) => void;
  abort: () => void;
  retry: () => void;
  stop: () => Promise<void>;
  resume: () => Promise<void>;
}

export interface StreamOptions<M extends string = string> {
  model?: M;
  system?: string;
  endpoint: string;
  fetch?: typeof globalThis.fetch;
  onFinish?: (text: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Reactive streaming text hook.
 * Call inside a component — lifecycle is tied to the component.
 */
export function useStream<M extends string = string>(
  options: StreamOptions<M>,
): UseStreamReturn {
  const [text, setText] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  const [done, setDone] = createSignal(false);
  const [status, setStatus] = createSignal<StreamStatus>("idle");
  const [streamId, setStreamId] = createSignal<string | null>(null);
  const [canResume, setCanResume] = createSignal(false);

  const ctrl = new StreamController(options as StreamControllerOptions, {
    onText: (t) => setText(t),
    onLoading: (l) => setLoading(l),
    onDone: (d) => setDone(d),
    onError: (e) => setError(e),
    onStatus: (s) => setStatus(s),
    onStreamId: (id) => setStreamId(id),
    onCanResume: (c) => setCanResume(c),
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
    send: (prompt: string, sendOpts?: SendOptions) =>
      ctrl.send(prompt, sendOpts),
    abort: () => ctrl.abort(),
    retry: () => ctrl.retry(),
    stop: () => ctrl.stop(),
    resume: () => ctrl.resume(),
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
