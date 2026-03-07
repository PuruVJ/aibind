import {
  CompletionController,
  UsageTracker as CoreUsageTracker,
  RaceController,
  StreamController,
  StructuredStreamController,
  type Artifact,
  type BaseCompletionOptions,
  type BaseStreamOptions,
  type ChatHistory,
  type CompletionCallbacks,
  type ConversationMessage,
  type DeepPartial,
  type DiffChunk,
  type RaceCallbacks,
  type RaceControllerOptions,
  type RaceStrategy,
  type SendOptions,
  type StreamCallbacks,
  type StreamControllerOptions,
  type StreamStatus,
  type StreamUsage,
  type StructuredStreamCallbacks,
  type StructuredStreamControllerOptions,
  type TurnUsage,
  type UsageTrackerOptions,
} from "@aibind/core";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { onDestroy } from "svelte";

export { defaultDiff, defineModels } from "@aibind/core";
export type {
  Artifact,
  ArtifactDetector,
  ArtifactLineResult,
  BaseCompletionOptions,
  BaseStreamOptions,
  DeepPartial,
  DiffChunk,
  DiffFn,
  LanguageModel,
  ModelPricing,
  RaceStrategy,
  SendOptions,
  StreamStatus,
  StreamUsage,
  TurnUsage,
  UsageRecorder,
  UsageTrackerOptions,
} from "@aibind/core";

// --- UsageTracker ---

/**
 * Reactive usage tracker. Accumulates token counts and cost across turns.
 * Pass as the `tracker` option in Stream / useStream.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { Stream, UsageTracker } from "@aibind/sveltekit";
 *   const tracker = new UsageTracker({ pricing: { fast: { inputPerMillion: 0.15, outputPerMillion: 0.60 } } });
 *   const stream = new Stream({ model: "fast", tracker });
 * </script>
 *
 * <p>Tokens: {tracker.inputTokens + tracker.outputTokens}</p>
 * <p>Cost: ${tracker.cost.toFixed(4)}</p>
 * ```
 */
export class UsageTracker {
  inputTokens = $state(0);
  outputTokens = $state(0);
  cost = $state(0);
  turns = $state(0);
  history = $state<TurnUsage[]>([]);

  readonly #core: CoreUsageTracker;

  constructor(options: UsageTrackerOptions = {}) {
    this.#core = new CoreUsageTracker({
      ...options,
      onUpdate: () => {
        this.inputTokens = this.#core.inputTokens;
        this.outputTokens = this.#core.outputTokens;
        this.cost = this.#core.cost;
        this.turns = this.#core.turns;
        this.history = this.#core.history;
        options.onUpdate?.();
      },
    });
  }

  record(usage: StreamUsage, model?: string): void {
    this.#core.record(usage, model);
  }

  reset(): void {
    this.#core.reset();
  }
}

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
  diff: DiffChunk[] | null = $state(null);
  artifacts: Artifact[] = $state([]);
  activeArtifact: Artifact | null = $derived(
    this.artifacts.findLast((a) => !a.complete) ?? null,
  );

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
      onDiff: (chunks) => {
        this.diff = chunks;
      },
      onArtifacts: (arts) => {
        this.artifacts = arts;
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

// --- Race ---

export interface RaceOptions<M extends string = string> {
  models: M[];
  endpoint: string;
  system?: string;
  strategy?: RaceStrategy;
  fetch?: typeof globalThis.fetch;
  onFinish?: (text: string, winner: M) => void;
  onError?: (error: Error) => void;
}

/**
 * Reactive multi-model race.
 * Sends the same prompt to all models simultaneously; the winner updates reactive state.
 * Strategy "complete" (default): first to finish wins.
 * Strategy "first-token": first to produce any text wins and streams live.
 */
export class Race<M extends string = string> {
  text = $state("");
  loading = $state(false);
  error: Error | null = $state(null);
  done = $state(false);
  winner: M | null = $state(null);

  #ctrl: RaceController;

  constructor(opts: RaceOptions<M>) {
    this.#ctrl = new RaceController(opts as RaceControllerOptions, {
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
      onWinner: (w) => {
        this.winner = w as M | null;
      },
    } satisfies RaceCallbacks);
    onDestroy(() => this.#ctrl.abort());
  }

  send(prompt: string, options?: { system?: string }): void {
    this.#ctrl.send(prompt, options);
  }

  abort(): void {
    this.#ctrl.abort();
  }
}
