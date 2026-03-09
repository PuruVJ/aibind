/**
 * Framework-agnostic inline completion controller.
 *
 * Handles debouncing, in-flight cancellation, and ghost-text state.
 * Framework packages create thin reactive wrappers around this.
 */

import type { BaseCompletionOptions, CompletionCallbacks } from "./types";

const DEFAULT_ENDPOINT = "/__aibind__/complete";
const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_MIN_LENGTH = 3;

export type { BaseCompletionOptions, CompletionCallbacks };

export class CompletionController {
  private _suggestion = "";
  private _loading = false;
  private _lastFetchedInput = "";
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _abortCtrl: AbortController | null = null;

  private readonly _opts: BaseCompletionOptions;
  private readonly _cb: CompletionCallbacks;

  private get _fetch(): typeof globalThis.fetch {
    return this._opts.fetch ?? globalThis.fetch;
  }

  constructor(options: BaseCompletionOptions, callbacks: CompletionCallbacks) {
    this._opts = options;
    this._cb = callbacks;
  }

  /**
   * Call on every input change. Debounces the request; clears stale suggestions
   * immediately. Below `minLength`, cancels any in-flight request.
   */
  update(input: string): void {
    // Clear stale ghost text immediately on any keystroke
    if (this._suggestion !== "") {
      this._suggestion = "";
      this._cb.onSuggestion("");
    }

    // Reset debounce timer
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }

    const minLength = this._opts.minLength ?? DEFAULT_MIN_LENGTH;
    if (input.length < minLength) {
      // Cancel any in-flight request when input is too short
      this._abortCtrl?.abort();
      this._abortCtrl = null;
      if (this._loading) {
        this._loading = false;
        this._cb.onLoading(false);
      }
      this._cb.onError(null);
      return;
    }

    this._timer = setTimeout(() => {
      this._timer = null;
      void this._doFetch(input);
    }, this._opts.debounce ?? DEFAULT_DEBOUNCE_MS);
  }

  /**
   * Accept the current suggestion.
   * Returns the full accepted string (`lastFetchedInput + suggestion`) and
   * clears the suggestion state. The caller should replace their input value
   * with the return value.
   */
  accept(): string {
    const result = this._lastFetchedInput + this._suggestion;
    if (this._suggestion !== "") {
      this._suggestion = "";
      this._cb.onSuggestion("");
    }
    return result;
  }

  /** Dismiss the suggestion without accepting it. */
  clear(): void {
    if (this._suggestion !== "") {
      this._suggestion = "";
      this._cb.onSuggestion("");
    }
  }

  /** Cancel any pending debounce and in-flight request. */
  abort(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._abortCtrl?.abort();
    this._abortCtrl = null;
    if (this._loading) {
      this._loading = false;
      this._cb.onLoading(false);
    }
  }

  private async _doFetch(input: string): Promise<void> {
    // Abort the previous in-flight request (if any)
    this._abortCtrl?.abort();
    const controller = new AbortController();
    this._abortCtrl = controller;

    this._lastFetchedInput = input;
    this._loading = true;
    this._cb.onLoading(true);
    this._cb.onError(null);

    try {
      const endpoint = this._opts.endpoint ?? DEFAULT_ENDPOINT;
      const response = await this._fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          system: this._opts.system,
          model: this._opts.model,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Completion request failed: ${response.status}`);
      }

      const suggestion = await response.text();

      // Bail out if abort() was called while awaiting the response
      if (controller.signal.aborted) return;

      this._suggestion = suggestion;
      this._cb.onSuggestion(suggestion);
      this._opts.onFinish?.(suggestion);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      const error = e instanceof Error ? e : new Error(String(e));
      this._cb.onError(error);
      this._opts.onError?.(error);
    } finally {
      // Only clean up if this request wasn't aborted (abort() handles its own cleanup)
      if (!controller.signal.aborted) {
        this._loading = false;
        this._cb.onLoading(false);
        if (this._abortCtrl === controller) {
          this._abortCtrl = null;
        }
      }
    }
  }
}
