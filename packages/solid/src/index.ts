import { createSignal, onCleanup } from "solid-js";
import type { Accessor } from "solid-js";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import {
  consumeTextStream,
  parsePartialJSON,
  consumeSSEStream,
} from "@aibind/core";
import type { LanguageModel, SendOptions } from "./types.js";

export type { SendOptions, DeepPartial, LanguageModel } from "./types.js";

export type StreamStatus =
  | "idle"
  | "streaming"
  | "stopped"
  | "done"
  | "reconnecting"
  | "disconnected"
  | "error";

// --- defineModels ---

/**
 * Define named AI models for type-safe model selection across client and server.
 * Returns the same object with a phantom `$infer` type for extracting model keys.
 */
export function defineModels<const T extends Record<string, LanguageModel>>(
  models: T,
): T & { readonly $infer: Extract<keyof T, string> } {
  return models as T & { readonly $infer: Extract<keyof T, string> };
}

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
  /** Model key (must match a key from defineModels). */
  model?: M;
  system?: string;
  /** Streaming endpoint. Required — no default. */
  endpoint: string;
  /** Custom fetch implementation. Defaults to globalThis.fetch. */
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
  if (!options.endpoint) {
    throw new Error(
      "@aibind/solid: useStream requires an `endpoint` option. If using @aibind/solidstart, endpoints are configured automatically.",
    );
  }

  const [text, setText] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  const [done, setDone] = createSignal(false);
  const [status, setStatus] = createSignal<StreamStatus>("idle");
  const [streamId, setStreamId] = createSignal<string | null>(null);
  const [canResume, setCanResume] = createSignal(false);

  let controller: AbortController | null = null;
  let lastPrompt = "";
  let lastOptions: SendOptions | undefined;
  let lastSeq = 0;
  let isSSE = false;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 3;

  async function consumeSSEMessages(response: Response, ctrl: AbortController) {
    for await (const msg of consumeSSEStream(response)) {
      if (ctrl.signal.aborted) break;

      if (msg.event === "stream-id") {
        setStreamId(msg.data);
        continue;
      }
      if (msg.event === "done") {
        setDone(true);
        if (status() === "streaming" || status() === "reconnecting") {
          setStatus("done");
        }
        options.onFinish?.(text());
        return;
      }
      if (msg.event === "stopped") {
        setStatus("stopped");
        continue;
      }
      if (msg.event === "error") {
        const err = new Error(msg.data);
        setError(err);
        setStatus("error");
        options.onError?.(err);
        continue;
      }

      if (msg.id) lastSeq = parseInt(msg.id, 10);
      setText((prev) => prev + msg.data);
    }

    if (!done() && status() === "streaming") {
      setStatus("reconnecting");
      await reconnect();
    }
  }

  async function reconnect() {
    while (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      const delay = Math.pow(2, reconnectAttempts - 1) * 1000;
      await new Promise((r) => setTimeout(r, delay));

      if (status() !== "reconnecting") return;

      try {
        const fetcher = options.fetch ?? globalThis.fetch;
        const ctrl = new AbortController();
        controller = ctrl;

        const response = await fetcher(
          `${options.endpoint}/resume?id=${streamId()}&after=${lastSeq}`,
          { signal: ctrl.signal },
        );

        if (!response.ok) throw new Error(`Resume failed: ${response.status}`);

        setStatus("streaming");
        setLoading(true);
        reconnectAttempts = 0;
        await consumeSSEMessages(response, ctrl);
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }

    setStatus("disconnected");
    setLoading(false);
    setCanResume(true);
  }

  async function run(
    prompt: string,
    sendOpts: SendOptions | undefined,
    ctrl: AbortController,
  ) {
    try {
      const endpoint = options.endpoint;
      const system = sendOpts?.system ?? options.system;
      const fetcher = options.fetch ?? globalThis.fetch;

      const response = await fetcher(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, system, model: options.model }),
        signal: ctrl.signal,
      });

      if (!response.ok)
        throw new Error(`Stream request failed: ${response.status}`);

      const contentType = response.headers.get("Content-Type") ?? "";
      if (contentType.includes("text/event-stream")) {
        isSSE = true;
        setStreamId(response.headers.get("X-Stream-Id"));
        await consumeSSEMessages(response, ctrl);
      } else {
        for await (const chunk of consumeTextStream(response)) {
          if (ctrl.signal.aborted) break;
          setText((prev) => prev + chunk);
        }
        setDone(true);
        setStatus("done");
        options.onFinish?.(text());
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        if (status() !== "stopped") {
          setDone(true);
          if (status() === "streaming") setStatus("done");
        }
        return;
      }

      if (isSSE && streamId() && status() === "streaming") {
        setStatus("reconnecting");
        await reconnect();
        return;
      }

      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      setStatus("error");
      options.onError?.(err);
    } finally {
      setLoading(false);
      controller = null;
    }
  }

  function send(prompt: string, sendOpts?: SendOptions) {
    controller?.abort();
    lastPrompt = prompt;
    lastOptions = sendOpts;
    setText("");
    setLoading(true);
    setError(null);
    setDone(false);
    setStatus("streaming");
    setStreamId(null);
    setCanResume(false);
    lastSeq = 0;
    isSSE = false;
    reconnectAttempts = 0;

    const ctrl = new AbortController();
    controller = ctrl;
    run(prompt, sendOpts, ctrl);
  }

  function abort() {
    controller?.abort();
    controller = null;
    setCanResume(false);
    isSSE = false;
    if (status() === "streaming" || status() === "reconnecting") {
      setStatus("idle");
    }
  }

  async function stop() {
    if (!streamId() || !isSSE) {
      abort();
      return;
    }
    const fetcher = options.fetch ?? globalThis.fetch;
    try {
      await fetcher(`${options.endpoint}/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: streamId() }),
      });
    } catch {}
    controller?.abort();
    controller = null;
    setLoading(false);
    setStatus("stopped");
    setCanResume(false);
  }

  async function resume() {
    if (!streamId() || !isSSE || !canResume()) return;
    setStatus("reconnecting");
    setLoading(true);
    setCanResume(false);
    reconnectAttempts = 0;
    await reconnect();
  }

  function retry() {
    if (lastPrompt) send(lastPrompt, lastOptions);
  }

  onCleanup(() => abort());

  return {
    text,
    loading,
    error,
    done,
    status,
    streamId,
    canResume,
    send,
    abort,
    retry,
    stop,
    resume,
  };
}

// --- useStructuredStream ---

export interface UseStructuredStreamReturn<T> {
  data: Accessor<T | null>;
  partial: Accessor<Partial<T> | null>;
  raw: Accessor<string>;
  loading: Accessor<boolean>;
  error: Accessor<Error | null>;
  done: Accessor<boolean>;
  send: (prompt: string, options?: SendOptions) => void;
  abort: () => void;
  retry: () => void;
}

export interface StructuredStreamOptions<T, M extends string = string> {
  /** Model key (must match a key from defineModels). */
  model?: M;
  /** Any Standard Schema-compatible schema (Zod, Valibot, ArkType, etc.) */
  schema: StandardSchemaV1<unknown, T>;
  system?: string;
  /** Structured streaming endpoint. Required — no default. */
  endpoint: string;
  /** Custom fetch implementation. Defaults to globalThis.fetch. */
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
  if (!opts.endpoint) {
    throw new Error(
      "@aibind/solid: useStructuredStream requires an `endpoint` option. If using @aibind/solidstart, endpoints are configured automatically.",
    );
  }

  const [data, setData] = createSignal<T | null>(null);
  const [partial, setPartial] = createSignal<Partial<T> | null>(null);
  const [raw, setRaw] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);
  const [done, setDone] = createSignal(false);

  let controller: AbortController | null = null;
  let lastPrompt = "";
  let lastOptions: SendOptions | undefined;
  let resolvedJsonSchema: Record<string, unknown> | null = null;
  let schemaResolved = false;

  async function resolveSchema(): Promise<Record<string, unknown> | null> {
    if (schemaResolved) return resolvedJsonSchema;
    schemaResolved = true;

    const std = (opts.schema as any)["~standard"];

    // 1. StandardJSONSchemaV1 (e.g. Zod v4)
    if (std?.jsonSchema && Object.keys(std.jsonSchema).length > 0) {
      resolvedJsonSchema = std.jsonSchema as Record<string, unknown>;
      return resolvedJsonSchema;
    }

    // 2. Schema instance has .toJsonSchema() (ArkType)
    const schema = opts.schema as any;
    if (typeof schema.toJsonSchema === "function") {
      try {
        resolvedJsonSchema = schema.toJsonSchema() as Record<string, unknown>;
        return resolvedJsonSchema;
      } catch {
        /* toJsonSchema() failed */
      }
    }

    // 3. Vendor-specific auto-conversion
    if (std?.vendor === "valibot") {
      try {
        const { toJsonSchema } = await import("@valibot/to-json-schema");
        resolvedJsonSchema = toJsonSchema(schema as never) as Record<
          string,
          unknown
        >;
        return resolvedJsonSchema;
      } catch {
        throw new Error(
          '@aibind/solid: Valibot schema detected but "@valibot/to-json-schema" is not installed. Install it or switch to a schema library with built-in JSON Schema support.',
        );
      }
    }

    if (std?.vendor === "zod") {
      try {
        const { toJSONSchema } = await import("zod/v4");
        resolvedJsonSchema = toJSONSchema(schema as never) as Record<
          string,
          unknown
        >;
        return resolvedJsonSchema;
      } catch {
        throw new Error(
          '@aibind/solid: Zod schema detected but "zod/v4" is not available. Use `import { z } from "zod/v4"` to create schemas, or install a newer version of zod.',
        );
      }
    }

    return null;
  }

  async function run(
    prompt: string,
    sendOpts: SendOptions | undefined,
    ctrl: AbortController,
  ) {
    try {
      const endpoint = opts.endpoint;
      const system = sendOpts?.system ?? opts.system;
      const schema = await resolveSchema();
      const fetcher = opts.fetch ?? globalThis.fetch;

      const response = await fetcher(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          system,
          model: opts.model,
          ...(schema && { schema }),
        }),
        signal: ctrl.signal,
      });

      if (!response.ok)
        throw new Error(`Structured stream failed: ${response.status}`);

      for await (const chunk of consumeTextStream(response)) {
        if (ctrl.signal.aborted) break;
        setRaw((prev) => prev + chunk);
        const parsed = parsePartialJSON<T>(raw());
        if (parsed) setPartial(() => parsed);
      }

      const finalParsed = JSON.parse(raw());
      const result = await opts.schema["~standard"].validate(finalParsed);
      if (result.issues) {
        throw new Error(
          `Validation failed: ${result.issues.map((i: any) => i.message).join(", ")}`,
        );
      }
      setData(() => result.value);
      setDone(true);
      opts.onFinish?.(result.value);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setDone(true);
        return;
      }

      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      opts.onError?.(err);
    } finally {
      setLoading(false);
      controller = null;
    }
  }

  function send(prompt: string, sendOpts?: SendOptions) {
    controller?.abort();
    lastPrompt = prompt;
    lastOptions = sendOpts;
    setData(null as any);
    setPartial(null as any);
    setRaw("");
    setLoading(true);
    setError(null);
    setDone(false);

    const ctrl = new AbortController();
    controller = ctrl;
    run(prompt, sendOpts, ctrl);
  }

  function abort() {
    controller?.abort();
    controller = null;
  }

  function retry() {
    if (lastPrompt) send(lastPrompt, lastOptions);
  }

  onCleanup(() => abort());

  return { data, partial, raw, loading, error, done, send, abort, retry };
}
