import {
  consumeSSEStream,
  consumeTextStream,
  parsePartialJSON,
} from "@aibind/core";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { onDestroy } from "svelte";
import type { LanguageModel, SendOptions } from "./types.js";

export type { DeepPartial, LanguageModel, SendOptions } from "./types.js";

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

interface BaseStreamOptions<M extends string = string> {
  model?: M;
  system?: string;
  endpoint: string;
  fetch?: typeof globalThis.fetch;
  onError?: (error: Error) => void;
}

export interface StreamOptions<
  M extends string = string,
> extends BaseStreamOptions<M> {
  onFinish?: (text: string) => void;
}

/**
 * Reactive streaming text.
 * Instantiate in a component's <script> block — lifecycle is tied to the component.
 *
 * Auto-detects SSE responses (Content-Type: text/event-stream) from resumable
 * server handlers. When SSE is detected, tracks streamId and sequence numbers,
 * enabling stop(), resume(), and auto-reconnect on network drops.
 *
 * Subclassable — override `_buildBody`, `_processChunk`, `_finalize`, `_resetState`
 * to customize behavior (see StructuredStream).
 */
export class Stream<M extends string = string> {
  text = $state("");
  loading = $state(false);
  error: Error | null = $state(null);
  done = $state(false);
  status: StreamStatus = $state("idle");
  streamId: string | null = $state(null);
  canResume = $state(false);

  #controller: AbortController | null = null;
  #lastPrompt = "";
  #lastOptions: SendOptions | undefined;
  #lastSeq = 0;
  #isSSE = false;
  #reconnectAttempts = 0;
  #maxReconnectAttempts = 3;
  #onFinish?: (text: string) => void;

  protected _opts: BaseStreamOptions<M>;

  get #fetch() {
    return this._opts.fetch ?? globalThis.fetch;
  }

  constructor(options: StreamOptions<M>) {
    if (!options.endpoint) {
      throw new Error(
        "@aibind/svelte: `endpoint` is required. If using @aibind/sveltekit, endpoints are configured automatically.",
      );
    }
    this._opts = options;
    this.#onFinish = options.onFinish;
    onDestroy(() => this.abort());
  }

  // --- Protected hooks for subclasses ---

  /** Build the request body. Override to add fields (e.g. schema). */
  protected async _buildBody(
    prompt: string,
    system: string | undefined,
  ): Promise<Record<string, unknown>> {
    return { prompt, system, model: this._opts.model };
  }

  /** Process a single text chunk. Override for custom parsing (e.g. partial JSON). */
  protected _processChunk(chunk: string): void {
    this.text += chunk;
  }

  /** Called when the stream completes. Override for validation/finalization. May throw. */
  protected async _finalize(): Promise<void> {
    this.#onFinish?.(this.text);
  }

  /** Reset subclass-specific state. Called by send(). Always call super._resetState(). */
  protected _resetState(): void {
    this.text = "";
  }

  // --- Public API ---

  send(prompt: string, options?: SendOptions) {
    this.#controller?.abort();
    this.#lastPrompt = prompt;
    this.#lastOptions = options;
    this._resetState();
    this.loading = true;
    this.error = null;
    this.done = false;
    this.status = "streaming";
    this.streamId = null;
    this.canResume = false;
    this.#lastSeq = 0;
    this.#isSSE = false;
    this.#reconnectAttempts = 0;

    const controller = new AbortController();
    this.#controller = controller;

    this.#run(prompt, options, controller);
  }

  abort() {
    this.#controller?.abort();
    this.#controller = null;
    this.canResume = false;
    this.#isSSE = false;
    if (this.status === "streaming" || this.status === "reconnecting") {
      this.status = "idle";
    }
  }

  retry() {
    if (this.#lastPrompt) this.send(this.#lastPrompt, this.#lastOptions);
  }

  /** Signal the server to stop LLM generation. Keeps partial text. */
  async stop() {
    if (!this.streamId || !this.#isSSE) {
      // Non-SSE: abort is the only option
      this.abort();
      return;
    }

    try {
      await this.#fetch(`${this._opts.endpoint}/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: this.streamId }),
      });
    } catch {
      // If stop request fails, abort locally
    }

    this.#controller?.abort();
    this.#controller = null;
    this.loading = false;
    this.status = "stopped";
    this.canResume = false;
  }

  /** Reconnect to an interrupted stream and resume from last received chunk. */
  async resume() {
    if (!this.streamId || !this.#isSSE || !this.canResume) return;

    this.status = "reconnecting";
    this.loading = true;
    this.canResume = false;
    this.#reconnectAttempts = 0;

    await this.#reconnect();
  }

  // --- Private internals ---

  async #run(
    prompt: string,
    options: SendOptions | undefined,
    controller: AbortController,
  ) {
    try {
      const system = options?.system ?? this._opts.system;
      const body = await this._buildBody(prompt, system);

      const response = await this.#fetch(this._opts.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok)
        throw new Error(`Stream request failed: ${response.status}`);

      // Auto-detect SSE
      const contentType = response.headers.get("Content-Type") ?? "";
      if (contentType.includes("text/event-stream")) {
        this.#isSSE = true;
        this.streamId = response.headers.get("X-Stream-Id");
        await this.#consumeSSE(response, controller);
      } else {
        // Plain text stream (non-resumable)
        for await (const chunk of consumeTextStream(response)) {
          if (controller.signal.aborted) break;
          this._processChunk(chunk);
        }
        await this._finalize();
        this.done = true;
        this.status = "done";
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        if (this.status !== "stopped") {
          this.done = true;
          if (this.status === "streaming") this.status = "done";
        }
        return;
      }

      // SSE mode: attempt auto-reconnect on network errors
      if (this.#isSSE && this.streamId && this.status === "streaming") {
        this.status = "reconnecting";
        await this.#reconnect();
        return;
      }

      this.error = e instanceof Error ? e : new Error(String(e));
      this.status = "error";
      this._opts.onError?.(this.error);
    } finally {
      this.loading = false;
      this.#controller = null;
    }
  }

  async #consumeSSE(response: Response, controller: AbortController) {
    for await (const msg of consumeSSEStream(response)) {
      if (controller.signal.aborted) break;

      if (msg.event === "stream-id") {
        this.streamId = msg.data;
        continue;
      }
      if (msg.event === "done") {
        try {
          await this._finalize();
        } catch (e) {
          this.error = e instanceof Error ? e : new Error(String(e));
          this.status = "error";
          this._opts.onError?.(this.error);
          return;
        }
        this.done = true;
        // Preserve error/stopped status — only set "done" if still streaming
        if (this.status === "streaming" || this.status === "reconnecting") {
          this.status = "done";
        }
        return;
      }
      if (msg.event === "stopped") {
        this.status = "stopped";
        continue;
      }
      if (msg.event === "error") {
        this.error = new Error(msg.data);
        this.status = "error";
        this._opts.onError?.(this.error);
        continue;
      }

      // Regular data chunk
      if (msg.id) this.#lastSeq = parseInt(msg.id, 10);
      this._processChunk(msg.data);
    }

    // If we exit the loop without a "done" event, the connection was interrupted
    if (!this.done && this.status === "streaming") {
      this.status = "reconnecting";
      await this.#reconnect();
    }
  }

  async #reconnect() {
    const maxAttempts = this.#maxReconnectAttempts;

    while (this.#reconnectAttempts < maxAttempts) {
      this.#reconnectAttempts++;
      const delay = Math.pow(2, this.#reconnectAttempts - 1) * 1000;
      await new Promise((r) => setTimeout(r, delay));

      if (this.status !== "reconnecting") return; // aborted during wait

      try {
        const controller = new AbortController();
        this.#controller = controller;

        const response = await this.#fetch(
          `${this._opts.endpoint}/resume?id=${this.streamId}&after=${this.#lastSeq}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error(`Resume failed: ${response.status}`);
        }

        this.status = "streaming";
        this.loading = true;
        this.#reconnectAttempts = 0;
        await this.#consumeSSE(response, controller);
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        // Continue to next retry
      }
    }

    // All retries exhausted
    this.status = "disconnected";
    this.loading = false;
    this.canResume = true; // User can manually call resume()
  }
}

// --- StructuredStream ---

export interface StructuredStreamOptions<
  T,
  M extends string = string,
> extends BaseStreamOptions<M> {
  /** Any Standard Schema-compatible schema (Zod, Valibot, ArkType, etc.) */
  schema: StandardSchemaV1<unknown, T>;
  onFinish?: (data: T) => void;
}

/**
 * Reactive structured streaming.
 * Extends Stream — inherits SSE auto-detect, stop/resume, and auto-reconnect.
 * Streams JSON and parses partial objects as they arrive.
 * Validates the final result with any Standard Schema-compatible library.
 */
export class StructuredStream<M extends string, T> extends Stream<M> {
  data: T | null = $state(null);
  partial: Partial<T> | null = $state(null);

  #schema: StandardSchemaV1<unknown, T>;
  #onStructuredFinish?: (data: T) => void;
  #resolvedJsonSchema: Record<string, unknown> | null = null;
  #schemaResolved = false;

  /** Alias for `text` — the raw JSON string as it streams in. */
  get raw() {
    return this.text;
  }

  constructor(options: StructuredStreamOptions<T, M>) {
    const { schema, onFinish, ...rest } = options;
    super(rest as StreamOptions<M>);
    this.#schema = schema;
    this.#onStructuredFinish = onFinish;
  }

  protected override async _buildBody(
    prompt: string,
    system: string | undefined,
  ): Promise<Record<string, unknown>> {
    const body = await super._buildBody(prompt, system);
    const schema = await this.#resolveSchema();
    return { ...body, ...(schema && { schema }) };
  }

  protected override _processChunk(chunk: string): void {
    this.text += chunk;
    const parsed = parsePartialJSON<T>(this.text);
    if (parsed) this.partial = parsed;
  }

  protected override async _finalize(): Promise<void> {
    const finalParsed = JSON.parse(this.text);
    const result = await this.#schema["~standard"].validate(finalParsed);
    if (result.issues) {
      throw new Error(
        `Validation failed: ${result.issues.map((i) => i.message).join(", ")}`,
      );
    }
    this.data = result.value;
    this.#onStructuredFinish?.(result.value);
  }

  protected override _resetState(): void {
    super._resetState();
    this.data = null;
    this.partial = null;
  }

  async #resolveSchema(): Promise<Record<string, unknown> | null> {
    if (this.#schemaResolved) return this.#resolvedJsonSchema;
    this.#schemaResolved = true;

    const std = (this.#schema as any)["~standard"];

    // 1. StandardJSONSchemaV1 (e.g. Zod v4)
    if (std?.jsonSchema && Object.keys(std.jsonSchema).length > 0) {
      this.#resolvedJsonSchema = std.jsonSchema as Record<string, unknown>;
      return this.#resolvedJsonSchema;
    }

    // 2. Schema instance has .toJsonSchema() (ArkType)
    const schema = this.#schema as any;
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
}
