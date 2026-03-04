import { onDestroy } from "svelte";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { consumeTextStream, parsePartialJSON } from "@aibind/core";
import type { LanguageModel, SendOptions } from "./types.js";

export type { SendOptions, DeepPartial, LanguageModel } from "./types.js";

// --- defineModels ---

/**
 * Define named AI models for type-safe model selection across client and server.
 * Returns the same object with a phantom `$infer` type for extracting model keys.
 *
 * @example
 * ```ts
 * // src/lib/models.ts
 * import { defineModels } from 'svai';
 * import { anthropic } from '@ai-sdk/anthropic';
 *
 * export const models = defineModels({
 *   default: anthropic('claude-sonnet-4'),
 *   fast: anthropic('claude-haiku'),
 * });
 * export type Models = typeof models.$infer; // 'default' | 'fast'
 * ```
 */
export function defineModels<const T extends Record<string, LanguageModel>>(
  models: T,
): T & { readonly $infer: Extract<keyof T, string> } {
  return models as T & { readonly $infer: Extract<keyof T, string> };
}

// --- Stream ---

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
 * Reactive streaming text.
 * Instantiate in a component's <script> block — lifecycle is tied to the component.
 */
export class Stream<M extends string = string> {
  text = $state("");
  loading = $state(false);
  error: Error | null = $state(null);
  done = $state(false);

  #controller: AbortController | null = null;
  #lastPrompt = "";
  #lastOptions: SendOptions | undefined;
  #config: StreamOptions<M>;

  constructor(options: StreamOptions<M>) {
    if (!options.endpoint) {
      throw new Error(
        "@aibind/svelte: Stream requires an `endpoint` option. If using @aibind/sveltekit, endpoints are configured automatically.",
      );
    }
    this.#config = options;
    onDestroy(() => this.abort());
  }

  send(prompt: string, options?: SendOptions) {
    this.#controller?.abort();
    this.#lastPrompt = prompt;
    this.#lastOptions = options;
    this.text = "";
    this.loading = true;
    this.error = null;
    this.done = false;

    const controller = new AbortController();
    this.#controller = controller;

    this.#run(prompt, options, controller);
  }

  abort() {
    this.#controller?.abort();
    this.#controller = null;
  }

  retry() {
    if (this.#lastPrompt) this.send(this.#lastPrompt, this.#lastOptions);
  }

  async #run(
    prompt: string,
    options: SendOptions | undefined,
    controller: AbortController,
  ) {
    try {
      const endpoint = this.#config.endpoint;
      const system = options?.system ?? this.#config.system;

      const fetcher = this.#config.fetch ?? globalThis.fetch;
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, system, model: this.#config.model }),
        signal: controller.signal,
      });

      if (!response.ok)
        throw new Error(`Stream request failed: ${response.status}`);

      for await (const chunk of consumeTextStream(response)) {
        if (controller.signal.aborted) break;
        this.text += chunk;
      }

      this.done = true;
      this.#config.onFinish?.(this.text);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        this.done = true;
        return;
      }

      this.error = e instanceof Error ? e : new Error(String(e));
      this.#config.onError?.(this.error);
    } finally {
      this.loading = false;
      this.#controller = null;
    }
  }
}

// --- StructuredStream ---

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
 * Reactive structured streaming.
 * Streams JSON and parses partial objects as they arrive.
 * Validates the final result with any Standard Schema-compatible library.
 */
export class StructuredStream<M extends string, T> {
  data: T | null = $state(null);
  partial: Partial<T> | null = $state(null);
  raw = $state("");
  loading = $state(false);
  error: Error | null = $state(null);
  done = $state(false);

  #controller: AbortController | null = null;
  #lastPrompt = "";
  #lastOptions: SendOptions | undefined;
  #config: StructuredStreamOptions<T, M>;
  #resolvedJsonSchema: Record<string, unknown> | null = null;
  #schemaResolved = false;

  constructor(options: StructuredStreamOptions<T, M>) {
    if (!options.endpoint) {
      throw new Error(
        "@aibind/svelte: StructuredStream requires an `endpoint` option. If using @aibind/sveltekit, endpoints are configured automatically.",
      );
    }
    this.#config = options;
    onDestroy(() => this.abort());
  }

  send(prompt: string, options?: SendOptions) {
    this.#controller?.abort();
    this.#lastPrompt = prompt;
    this.#lastOptions = options;
    this.data = null;
    this.partial = null;
    this.raw = "";
    this.loading = true;
    this.error = null;
    this.done = false;

    const controller = new AbortController();
    this.#controller = controller;

    this.#run(prompt, options, controller);
  }

  abort() {
    this.#controller?.abort();
    this.#controller = null;
  }

  retry() {
    if (this.#lastPrompt) this.send(this.#lastPrompt, this.#lastOptions);
  }

  async #resolveSchema(): Promise<Record<string, unknown> | null> {
    if (this.#schemaResolved) return this.#resolvedJsonSchema;
    this.#schemaResolved = true;

    const std = (this.#config.schema as any)["~standard"];

    // 1. StandardJSONSchemaV1 (e.g. Zod v4)
    if (std?.jsonSchema && Object.keys(std.jsonSchema).length > 0) {
      this.#resolvedJsonSchema = std.jsonSchema as Record<string, unknown>;
      return this.#resolvedJsonSchema;
    }

    // 2. Schema instance has .toJsonSchema() (ArkType)
    const schema = this.#config.schema as any;
    if (typeof schema.toJsonSchema === "function") {
      try {
        this.#resolvedJsonSchema = schema.toJsonSchema() as Record<
          string,
          unknown
        >;
        return this.#resolvedJsonSchema;
      } catch {
        /* toJsonSchema() failed */
      }
    }

    // 3. Vendor-specific auto-conversion
    if (std?.vendor === "valibot") {
      try {
        const { toJsonSchema } = await import("@valibot/to-json-schema");
        this.#resolvedJsonSchema = toJsonSchema(schema as never) as Record<
          string,
          unknown
        >;
        return this.#resolvedJsonSchema;
      } catch {
        throw new Error(
          'svai: Valibot schema detected but "@valibot/to-json-schema" is not installed. Install it or switch to a schema library with built-in JSON Schema support.',
        );
      }
    }

    if (std?.vendor === "zod") {
      try {
        const { toJSONSchema } = await import("zod/v4");
        this.#resolvedJsonSchema = toJSONSchema(schema as never) as Record<
          string,
          unknown
        >;
        return this.#resolvedJsonSchema;
      } catch {
        throw new Error(
          'svai: Zod schema detected but "zod/v4" is not available. Use `import { z } from "zod/v4"` to create schemas, or install a newer version of zod.',
        );
      }
    }

    return null;
  }

  async #run(
    prompt: string,
    options: SendOptions | undefined,
    controller: AbortController,
  ) {
    try {
      const endpoint = this.#config.endpoint;
      const system = options?.system ?? this.#config.system;
      const schema = await this.#resolveSchema();

      const fetcher = this.#config.fetch ?? globalThis.fetch;
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          system,
          model: this.#config.model,
          ...(schema && { schema }),
        }),
        signal: controller.signal,
      });

      if (!response.ok)
        throw new Error(`Structured stream failed: ${response.status}`);

      for await (const chunk of consumeTextStream(response)) {
        if (controller.signal.aborted) break;
        this.raw += chunk;
        const parsed = parsePartialJSON<T>(this.raw);
        if (parsed) this.partial = parsed;
      }

      const finalParsed = JSON.parse(this.raw);
      const result =
        await this.#config.schema["~standard"].validate(finalParsed);
      if (result.issues) {
        throw new Error(
          `Validation failed: ${result.issues.map((i) => i.message).join(", ")}`,
        );
      }
      this.data = result.value;
      this.done = true;
      this.#config.onFinish?.(result.value);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        this.done = true;
        return;
      }

      this.error = e instanceof Error ? e : new Error(String(e));
      this.#config.onError?.(this.error);
    } finally {
      this.loading = false;
      this.#controller = null;
    }
  }
}
