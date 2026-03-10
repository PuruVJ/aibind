/**
 * Framework-agnostic race controller.
 *
 * Sends the same prompt to multiple models simultaneously and elects
 * a winner based on the chosen strategy:
 *   - "complete"    (default) — first model to finish wins
 *   - "first-token"           — first model to emit any text wins; streams live
 */

import { consumeTextStream } from "./stream-utils";
import { SSE } from "./sse";
import type { UsageRecorder, StreamUsage } from "./types";

export type RaceStrategy = "complete" | "first-token";

export interface RaceCallbacks {
  onText(text: string): void;
  onLoading(loading: boolean): void;
  onDone(done: boolean): void;
  onError(error: Error | null): void;
  onWinner(model: string | null): void;
}

export interface RaceControllerOptions {
  /** Models to race. All receive the same prompt simultaneously. */
  models: string[];
  endpoint: string;
  system?: string;
  /**
   * How to pick a winner.
   * - `"complete"` (default) — first model whose stream finishes wins.
   * - `"first-token"` — first model to produce any text wins and streams live.
   */
  strategy?: RaceStrategy;
  fetch?: typeof globalThis.fetch;
  /**
   * Accumulate token usage for the winning model's response.
   * Losers are cancelled before completing, so only winner tokens are recorded.
   */
  tracker?: UsageRecorder;
  onFinish?: (text: string, winner: string) => void;
  onError?: (error: Error) => void;
}

export class RaceController {
  private _opts: RaceControllerOptions;
  private _cb: RaceCallbacks;
  private _controllers = new Map<string, AbortController>();
  private _winner: string | null = null;
  private _pending = new Set<string>();
  private _errors: Error[] = [];

  private get _fetch(): typeof globalThis.fetch {
    return this._opts.fetch ?? globalThis.fetch;
  }

  constructor(opts: RaceControllerOptions, callbacks: RaceCallbacks) {
    if (!opts.endpoint) throw new Error("@aibind: `endpoint` is required.");
    if (!opts.models.length)
      throw new Error("@aibind: `models` must not be empty.");
    this._opts = opts;
    this._cb = callbacks;
  }

  send(prompt: string, options?: { system?: string }): void {
    this.abort();
    this._winner = null;
    this._errors = [];
    this._pending = new Set(this._opts.models);

    this._cb.onText("");
    this._cb.onLoading(true);
    this._cb.onDone(false);
    this._cb.onError(null);
    this._cb.onWinner(null);

    const system = options?.system ?? this._opts.system;
    for (const model of this._opts.models) {
      const ctrl = new AbortController();
      this._controllers.set(model, ctrl);
      this._runModel(model, prompt, system, ctrl);
    }
  }

  abort(): void {
    for (const ctrl of this._controllers.values()) ctrl.abort();
    this._controllers.clear();
    this._cb.onLoading(false);
  }

  private async _runModel(
    model: string,
    prompt: string,
    system: string | undefined,
    controller: AbortController,
  ): Promise<void> {
    try {
      const response = await this._fetch(this._opts.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, system, model }),
        signal: controller.signal,
      });

      if (!response.ok)
        throw new Error(`Race request failed: ${response.status}`);

      let text = "";
      const strategy = this._opts.strategy ?? "complete";
      const isSSE = (response.headers.get("Content-Type") ?? "").includes(
        "text/event-stream",
      );

      const onChunk = (chunk: string): void => {
        text += chunk;
        if (strategy === "first-token" && !this._winner) {
          this._electWinner(model, text);
        } else if (this._winner === model) {
          this._cb.onText(text);
        }
      };

      // Buffer usage payload — for "complete" strategy the winner isn't known
      // until the stream finishes, so we can't record immediately on the event.
      let usagePayload: string | null = null;

      if (isSSE) {
        for await (const msg of SSE.consume(response)) {
          if (controller.signal.aborted) return;
          if (msg.event === "done") break;
          if (msg.event === "usage") {
            usagePayload = msg.data;
            // "first-token" strategy: winner already elected, record now
            if (strategy === "first-token" && this._winner === model) {
              try {
                this._opts.tracker?.record(
                  JSON.parse(usagePayload) as StreamUsage,
                  model,
                );
              } catch {
                /* malformed usage payload */
              }
            }
          }
          if (!msg.event) onChunk(msg.data);
        }
      } else {
        for await (const chunk of consumeTextStream(response)) {
          if (controller.signal.aborted) return;
          onChunk(chunk);
        }
      }

      // "complete" strategy: elect after stream finishes
      if (!this._winner && strategy === "complete") {
        this._electWinner(model, text);
      }

      // Record usage for the winner (deferred for "complete" strategy)
      if (
        this._winner === model &&
        this._opts.tracker &&
        usagePayload !== null
      ) {
        try {
          this._opts.tracker.record(
            JSON.parse(usagePayload) as StreamUsage,
            model,
          );
        } catch {
          /* malformed usage payload */
        }
      }

      this._pending.delete(model);

      if (this._winner === model) {
        this._cb.onText(text);
        this._cb.onDone(true);
        this._cb.onLoading(false);
        this._opts.onFinish?.(text, model);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        this._pending.delete(model);
        return;
      }
      this._pending.delete(model);
      this._errors.push(e instanceof Error ? e : new Error(String(e)));
      if (this._pending.size === 0 && !this._winner) {
        const err = this._errors[0];
        this._cb.onError(err);
        this._cb.onLoading(false);
        this._opts.onError?.(err);
      }
    }
  }

  private _electWinner(model: string, text: string): void {
    this._winner = model;
    this._cb.onWinner(model);
    this._cb.onText(text);
    for (const [m, ctrl] of this._controllers) {
      if (m !== model) ctrl.abort();
    }
  }
}
