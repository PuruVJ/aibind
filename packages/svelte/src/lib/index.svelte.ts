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
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { onDestroy } from "svelte";

export { defineModels } from "@aibind/core";
export type {
  DeepPartial,
  LanguageModel,
  SendOptions,
  StreamStatus,
  StreamUsage,
  BaseStreamOptions,
  BaseCompletionOptions,
} from "@aibind/core";

// --- Completion ---

export interface CompletionOptions extends BaseCompletionOptions {}

/**
 * Reactive inline completion.
 * Debounces requests, cancels in-flight calls on each keystroke, and exposes
 * the ghost-text suggestion as reactive state.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Completion } from "@aibind/sveltekit";
 *   const completion = new Completion({ model: "fast" });
 *   let input = $state("");
 * </script>
 *
 * <input
 *   bind:value={input}
 *   oninput={() => completion.update(input)}
 *   onkeydown={(e) => { if (e.key === "Tab") { input = completion.accept(); e.preventDefault(); }}}
 * />
 * <span class="ghost">{input}{completion.suggestion}</span>
 * ```
 */
export class Completion {
  suggestion = $state("");
  loading = $state(false);
  error: Error | null = $state(null);

  #ctrl: CompletionController;

  constructor(options: CompletionOptions = {}) {
    this.#ctrl = new CompletionController(options, {
      onSuggestion: (s) => {
        this.suggestion = s;
      },
      onLoading: (l) => {
        this.loading = l;
      },
      onError: (e) => {
        this.error = e;
      },
    } satisfies CompletionCallbacks);
    onDestroy(() => this.abort());
  }

  /** Call on every input change. Debounced. */
  update(input: string): void {
    this.#ctrl.update(input);
  }

  /**
   * Accept the current suggestion.
   * Returns `lastInput + suggestion` and clears ghost text.
   * Assign the return value back to your input binding.
   */
  accept(): string {
    return this.#ctrl.accept();
  }

  /** Dismiss the suggestion without accepting. */
  clear(): void {
    this.#ctrl.clear();
  }

  /** Cancel any pending debounce and in-flight request. */
  abort(): void {
    this.#ctrl.abort();
  }
}

// --- Stream ---

export interface StreamOptions<
  M extends string = string,
> extends BaseStreamOptions {
  model?: M;
  routeModel?: (prompt: string) => M | Promise<M>;
}

/**
 * Reactive streaming text.
 * Instantiate in a component's <script> block — lifecycle is tied to the component.
 *
 * Auto-detects SSE responses (Content-Type: text/event-stream) from resumable
 * server handlers. When SSE is detected, tracks streamId and sequence numbers,
 * enabling stop(), resume(), and auto-reconnect on network drops.
 */
export class Stream<M extends string = string> {
  text = $state("");
  loading = $state(false);
  error: Error | null = $state(null);
  done = $state(false);
  status: StreamStatus = $state("idle");
  streamId: string | null = $state(null);
  canResume = $state(false);
  usage: StreamUsage | null = $state(null);

  #model: M | undefined = $state(undefined);
  #ctrl: StreamController;

  get model(): M | undefined {
    return this.#model;
  }

  /** Set the default model for all future sends. Reactive — UI updates immediately. */
  set model(value: M) {
    this.#model = value;
    this.#ctrl.setModel(value);
  }

  constructor(options: StreamOptions<M>) {
    this.#model = options.model as M | undefined;
    this.#ctrl = new StreamController(options as StreamControllerOptions, {
      onText: (t) => {
        this.text = t;
      },
      onLoading: (l) => {
        this.loading = l;
      },
      onDone: (d) => {
        this.done = d;
      },
      onError: (e) => {
        this.error = e;
      },
      onStatus: (s) => {
        this.status = s;
      },
      onStreamId: (id) => {
        this.streamId = id;
      },
      onCanResume: (c) => {
        this.canResume = c;
      },
      onUsage: (u) => {
        this.usage = u;
      },
    } satisfies StreamCallbacks);
    onDestroy(() => this.abort());
  }

  send(prompt: string, options?: { system?: string; model?: M }): void {
    this.#ctrl.send(prompt, options);
  }

  abort(): void {
    this.#ctrl.abort();
  }

  retry(): void {
    this.#ctrl.retry();
  }

  async stop(): Promise<void> {
    return this.#ctrl.stop();
  }

  async resume(): Promise<void> {
    return this.#ctrl.resume();
  }

  async compact(
    chat: ChatHistory<ConversationMessage>,
  ): Promise<{ tokensSaved: number }> {
    return this.#ctrl.compact(chat);
  }
}

// --- StructuredStream ---

export interface StructuredStreamOptions<T, M extends string = string> {
  model?: M;
  system?: string;
  endpoint: string;
  fetch?: typeof globalThis.fetch;
  schema: StandardSchemaV1<unknown, T>;
  onFinish?: (data: T) => void;
  onError?: (error: Error) => void;
}

/**
 * Reactive structured streaming.
 * Streams JSON and parses partial objects as they arrive.
 * Validates the final result with any Standard Schema-compatible library.
 */
export class StructuredStream<M extends string, T> {
  text = $state("");
  loading = $state(false);
  error: Error | null = $state(null);
  done = $state(false);
  status: StreamStatus = $state("idle");
  streamId: string | null = $state(null);
  canResume = $state(false);
  data: T | null = $state(null);
  partial: DeepPartial<T> | null = $state(null);

  #ctrl: StructuredStreamController<T>;

  get raw(): string {
    return this.text;
  }

  constructor(options: StructuredStreamOptions<T, M>) {
    this.#ctrl = new StructuredStreamController<T>(
      options as unknown as StructuredStreamControllerOptions<T>,
      {
        onText: (t) => {
          this.text = t;
        },
        onLoading: (l) => {
          this.loading = l;
        },
        onDone: (d) => {
          this.done = d;
        },
        onError: (e) => {
          this.error = e;
        },
        onStatus: (s) => {
          this.status = s;
        },
        onStreamId: (id) => {
          this.streamId = id;
        },
        onCanResume: (c) => {
          this.canResume = c;
        },
        onPartial: (p) => {
          this.partial = p;
        },
        onData: (d) => {
          this.data = d;
        },
      } satisfies StructuredStreamCallbacks<T>,
    );
    onDestroy(() => this.abort());
  }

  send(prompt: string, options?: SendOptions): void {
    this.#ctrl.send(prompt, options);
  }

  abort(): void {
    this.#ctrl.abort();
  }

  retry(): void {
    this.#ctrl.retry();
  }

  async stop(): Promise<void> {
    return this.#ctrl.stop();
  }

  async resume(): Promise<void> {
    return this.#ctrl.resume();
  }
}
