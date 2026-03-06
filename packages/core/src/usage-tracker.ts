import type { StreamUsage, UsageRecorder } from "./types";

/** USD pricing for a single model, per 1 million tokens. */
export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

/** Usage record for a single completed stream turn. */
export interface TurnUsage {
  model: string | undefined;
  inputTokens: number;
  outputTokens: number;
  /** Computed cost in USD (0 if no pricing was provided for this model). */
  cost: number;
  timestamp: number;
}

export interface UsageTrackerOptions {
  /** Pricing map keyed by model name. Used to compute per-turn cost. */
  pricing?: Record<string, ModelPricing>;
  /**
   * Called after every `record()` or `reset()` call.
   * Use this to sync reactive framework state.
   */
  onUpdate?: () => void;
}

/**
 * Accumulates token usage and cost across multiple stream turns.
 *
 * @example
 * ```ts
 * const tracker = new UsageTracker({
 *   pricing: {
 *     fast:  { inputPerMillion: 0.15,  outputPerMillion: 0.60  },
 *     smart: { inputPerMillion: 3.00,  outputPerMillion: 15.00 },
 *   },
 * });
 *
 * const stream = new Stream({ model: "fast", tracker });
 * // tracker.inputTokens, tracker.outputTokens, tracker.cost update after each turn
 * ```
 */
export class UsageTracker implements UsageRecorder {
  inputTokens = 0;
  outputTokens = 0;
  /** Total cost in USD across all recorded turns. */
  cost = 0;
  turns = 0;
  history: TurnUsage[] = [];

  readonly #pricing: Record<string, ModelPricing>;
  readonly #onUpdate: (() => void) | undefined;

  constructor(options: UsageTrackerOptions = {}) {
    this.#pricing = options.pricing ?? {};
    this.#onUpdate = options.onUpdate;
  }

  record(usage: StreamUsage, model?: string): void {
    const pricing = model != null ? (this.#pricing[model] ?? null) : null;
    const cost =
      pricing != null
        ? (usage.inputTokens / 1_000_000) * pricing.inputPerMillion +
          (usage.outputTokens / 1_000_000) * pricing.outputPerMillion
        : 0;

    this.inputTokens += usage.inputTokens;
    this.outputTokens += usage.outputTokens;
    this.cost += cost;
    this.turns += 1;
    this.history = [
      ...this.history,
      {
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cost,
        timestamp: Date.now(),
      },
    ];

    this.#onUpdate?.();
  }

  reset(): void {
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.cost = 0;
    this.turns = 0;
    this.history = [];
    this.#onUpdate?.();
  }
}
