import { ref, onUnmounted } from "vue";
import type { Ref } from "vue";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { consumeTextStream, parsePartialJSON } from "@aibind/core";
import type { LanguageModel, SendOptions, DeepPartial } from "./types.js";

export type { SendOptions, DeepPartial, LanguageModel } from "./types.js";

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
  text: Ref<string>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  done: Ref<boolean>;
  send: (prompt: string, sendOpts?: SendOptions) => void;
  abort: () => void;
  retry: () => void;
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
 * Reactive streaming text composable.
 * Call inside a component's `setup()` — lifecycle is tied to the component.
 */
export function useStream<M extends string = string>(
  options: StreamOptions<M>,
): UseStreamReturn {
  if (!options.endpoint) {
    throw new Error(
      "@aibind/vue: useStream requires an `endpoint` option. If using @aibind/nuxt, endpoints are configured automatically.",
    );
  }
  const text = ref("");
  const loading = ref(false);
  const error: Ref<Error | null> = ref(null);
  const done = ref(false);

  let controller: AbortController | null = null;
  let lastPrompt = "";
  let lastOptions: SendOptions | undefined;

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

      for await (const chunk of consumeTextStream(response)) {
        if (ctrl.signal.aborted) break;
        text.value += chunk;
      }

      done.value = true;
      options.onFinish?.(text.value);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        done.value = true;
        return;
      }

      error.value = e instanceof Error ? e : new Error(String(e));
      options.onError?.(error.value);
    } finally {
      loading.value = false;
      controller = null;
    }
  }

  function send(prompt: string, sendOpts?: SendOptions) {
    controller?.abort();
    lastPrompt = prompt;
    lastOptions = sendOpts;
    text.value = "";
    loading.value = true;
    error.value = null;
    done.value = false;

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

  onUnmounted(() => abort());

  return { text, loading, error, done, send, abort, retry };
}

// --- useStructuredStream ---

export interface UseStructuredStreamReturn<T> {
  data: Ref<T | null>;
  partial: Ref<Partial<T> | null>;
  raw: Ref<string>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  done: Ref<boolean>;
  send: (prompt: string, sendOpts?: SendOptions) => void;
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
 * Reactive structured streaming composable.
 * Streams JSON and parses partial objects as they arrive.
 * Validates the final result with any Standard Schema-compatible library.
 */
export function useStructuredStream<M extends string, T>(
  opts: StructuredStreamOptions<T, M>,
): UseStructuredStreamReturn<T> {
  if (!opts.endpoint) {
    throw new Error(
      "@aibind/vue: useStructuredStream requires an `endpoint` option. If using @aibind/nuxt, endpoints are configured automatically.",
    );
  }
  const data: Ref<T | null> = ref(null);
  const partial: Ref<Partial<T> | null> = ref(null);
  const raw = ref("");
  const loading = ref(false);
  const error: Ref<Error | null> = ref(null);
  const done = ref(false);

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
          '@aibind/vue: Valibot schema detected but "@valibot/to-json-schema" is not installed. Install it or switch to a schema library with built-in JSON Schema support.',
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
          '@aibind/vue: Zod schema detected but "zod/v4" is not available. Use `import { z } from "zod/v4"` to create schemas, or install a newer version of zod.',
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
        raw.value += chunk;
        const parsed = parsePartialJSON<T>(raw.value);
        if (parsed) partial.value = parsed;
      }

      const finalParsed = JSON.parse(raw.value);
      const result = await opts.schema["~standard"].validate(finalParsed);
      if (result.issues) {
        throw new Error(
          `Validation failed: ${result.issues.map((i: any) => i.message).join(", ")}`,
        );
      }
      data.value = result.value;
      done.value = true;
      opts.onFinish?.(result.value);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        done.value = true;
        return;
      }

      error.value = e instanceof Error ? e : new Error(String(e));
      opts.onError?.(error.value);
    } finally {
      loading.value = false;
      controller = null;
    }
  }

  function send(prompt: string, sendOpts?: SendOptions) {
    controller?.abort();
    lastPrompt = prompt;
    lastOptions = sendOpts;
    data.value = null;
    partial.value = null;
    raw.value = "";
    loading.value = true;
    error.value = null;
    done.value = false;

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

  onUnmounted(() => abort());

  return { data, partial, raw, loading, error, done, send, abort, retry };
}
