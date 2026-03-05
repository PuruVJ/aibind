import { useState, useEffect, useRef } from "react";
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
  text: string;
  loading: boolean;
  error: Error | null;
  done: boolean;
  status: StreamStatus;
  streamId: string | null;
  canResume: boolean;
  send: (prompt: string, sendOpts?: SendOptions) => void;
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
 * React hook for streaming text from an AI endpoint.
 *
 * @example
 * ```tsx
 * const { text, loading, send } = useStream({ endpoint: '/api/stream' });
 * ```
 */
export function useStream<M extends string = string>(
  options: StreamOptions<M>,
): UseStreamReturn {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [done, setDone] = useState(false);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [streamId, setStreamId] = useState<string | null>(null);
  const [canResume, setCanResume] = useState(false);

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
    send: (prompt: string, sendOpts?: SendOptions) =>
      ctrlRef.current!.send(prompt, sendOpts),
    abort: () => ctrlRef.current!.abort(),
    retry: () => ctrlRef.current!.retry(),
    stop: () => ctrlRef.current!.stop(),
    resume: () => ctrlRef.current!.resume(),
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
