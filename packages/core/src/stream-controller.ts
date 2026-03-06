/**
 * Framework-agnostic stream controller.
 *
 * Handles all streaming logic: fetch, SSE auto-detection, reconnect,
 * stop/resume, abort. Framework packages create thin wrappers that
 * wire callbacks to their reactive primitives ($state, ref, createSignal).
 */

import { consumeTextStream } from "./stream-utils";
import { SSE } from "./sse";
import type { StreamStatus, StreamUsage, SendOptions } from "./types";
import type { ChatHistory } from "./chat-history";
import type { ConversationMessage } from "./conversation-store";

// --- Callbacks ---

export interface StreamCallbacks {
  onText(text: string): void;
  onLoading(loading: boolean): void;
  onDone(done: boolean): void;
  onError(error: Error | null): void;
  onStatus(status: StreamStatus): void;
  onStreamId(id: string | null): void;
  onCanResume(canResume: boolean): void;
  onUsage?(usage: StreamUsage): void;
}

export interface StreamControllerOptions {
  model?: string;
  system?: string;
  endpoint: string;
  fetch?: typeof globalThis.fetch;
  onFinish?: (text: string) => void;
  onError?: (error: Error) => void;
  /**
   * Session ID for server-side conversation history.
   * When set, the server will maintain conversation context across sends
   * using a ConversationStore. Set once at construction — tied to the
   * stream instance lifecycle.
   */
  sessionId?: string;
  /**
   * Automatically select a model for each request based on the prompt.
   * Called before every send unless an explicit `model` is passed in send options.
   * Priority: explicit send override > routeModel > constructor model default.
   */
  routeModel?: (prompt: string) => string | Promise<string>;
}

// --- StreamController ---

export class StreamController {
  protected _text = "";
  private _controller: AbortController | null = null;
  private _lastPrompt = "";
  private _lastOptions: SendOptions | undefined;
  private _lastSeq = 0;
  private _isSSE = false;
  private _reconnectAttempts = 0;
  private _maxReconnectAttempts = 3;
  private _done = false;
  private _status: StreamStatus = "idle";
  private _streamId: string | null = null;

  protected _opts: StreamControllerOptions;
  protected _cb: StreamCallbacks;

  get text(): string {
    return this._text;
  }

  private get _fetch(): typeof globalThis.fetch {
    return this._opts.fetch ?? globalThis.fetch;
  }

  constructor(options: StreamControllerOptions, callbacks: StreamCallbacks) {
    if (!options.endpoint) {
      throw new Error("@aibind: `endpoint` is required.");
    }
    this._opts = options;
    this._cb = callbacks;
  }

  // --- Protected hooks for StructuredStreamController ---

  /** Change the default model for all future sends. */
  setModel(model: string): void {
    this._opts.model = model;
  }

  protected async _buildBody(
    prompt: string,
    system: string | undefined,
    model: string | undefined,
  ): Promise<Record<string, unknown>> {
    return { prompt, system, model, sessionId: this._opts.sessionId };
  }

  protected _processChunk(chunk: string): void {
    this._text += chunk;
    this._cb.onText(this._text);
  }

  protected async _finalize(): Promise<void> {
    this._opts.onFinish?.(this._text);
  }

  protected _resetState(): void {
    this._text = "";
    this._cb.onText("");
  }

  // --- Public API ---

  send(prompt: string, options?: SendOptions): void {
    this._controller?.abort();
    this._lastPrompt = prompt;
    this._lastOptions = options;
    this._resetState();
    this._done = false;
    this._status = "streaming";
    this._streamId = null;
    this._isSSE = false;
    this._lastSeq = 0;
    this._reconnectAttempts = 0;

    this._cb.onLoading(true);
    this._cb.onError(null);
    this._cb.onDone(false);
    this._cb.onStatus("streaming");
    this._cb.onStreamId(null);
    this._cb.onCanResume(false);

    const controller = new AbortController();
    this._controller = controller;

    this._run(prompt, options, controller);
  }

  abort(): void {
    this._controller?.abort();
    this._controller = null;
    this._isSSE = false;
    this._cb.onCanResume(false);
    if (this._status === "streaming" || this._status === "reconnecting") {
      this._status = "idle";
      this._cb.onStatus("idle");
    }
  }

  retry(): void {
    if (this._lastPrompt) this.send(this._lastPrompt, this._lastOptions);
  }

  async stop(): Promise<void> {
    if (!this._streamId || !this._isSSE) {
      this.abort();
      return;
    }

    try {
      await this._fetch(`${this._opts.endpoint}/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: this._streamId }),
      });
    } catch {
      // If stop request fails, abort locally
    }

    this._controller?.abort();
    this._controller = null;
    this._status = "stopped";
    this._cb.onLoading(false);
    this._cb.onStatus("stopped");
    this._cb.onCanResume(false);
  }

  async compact(
    chat: ChatHistory<ConversationMessage>,
  ): Promise<{ tokensSaved: number }> {
    const response = await this._fetch(`${this._opts.endpoint}/compact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: chat.messages,
        sessionId: this._opts.sessionId,
      }),
    });
    if (!response.ok) {
      throw new Error(`Compact request failed: ${response.status}`);
    }
    const { summary, tokensSaved } = (await response.json()) as {
      summary: string;
      tokensSaved: number;
    };
    chat.compact({ role: "system", content: summary });
    return { tokensSaved };
  }

  async resume(): Promise<void> {
    if (!this._streamId || !this._isSSE) return;

    this._status = "reconnecting";
    this._reconnectAttempts = 0;
    this._cb.onStatus("reconnecting");
    this._cb.onLoading(true);
    this._cb.onCanResume(false);

    await this._reconnect();
  }

  // --- Private internals ---

  private async _run(
    prompt: string,
    options: SendOptions | undefined,
    controller: AbortController,
  ): Promise<void> {
    try {
      const system = options?.system ?? this._opts.system;
      let model: string | undefined;
      if (options?.model) {
        model = options.model;
      } else if (this._opts.routeModel) {
        try {
          model = await this._opts.routeModel(prompt);
        } catch {
          // Router failed — fall back to the configured default
          model = this._opts.model;
        }
        // Bail out if abort() was called while the async router was running
        if (controller.signal.aborted) return;
      } else {
        model = this._opts.model;
      }
      const body = await this._buildBody(prompt, system, model);

      const response = await this._fetch(this._opts.endpoint, {
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
        this._isSSE = true;
        this._streamId = response.headers.get("X-Stream-Id");
        this._cb.onStreamId(this._streamId);
        await this._consumeSSE(response, controller);
      } else {
        // Plain text stream (non-resumable)
        for await (const chunk of consumeTextStream(response)) {
          if (controller.signal.aborted) break;
          this._processChunk(chunk);
        }
        await this._finalize();
        this._done = true;
        this._status = "done";
        this._cb.onDone(true);
        this._cb.onStatus("done");
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        if (this._status !== "stopped") {
          this._done = true;
          this._cb.onDone(true);
          if (this._status === "streaming") {
            this._status = "done";
            this._cb.onStatus("done");
          }
        }
        return;
      }

      // SSE mode: attempt auto-reconnect on network errors
      if (this._isSSE && this._streamId && this._status === "streaming") {
        this._status = "reconnecting";
        this._cb.onStatus("reconnecting");
        await this._reconnect();
        return;
      }

      const error = e instanceof Error ? e : new Error(String(e));
      this._status = "error";
      this._cb.onError(error);
      this._cb.onStatus("error");
      this._opts.onError?.(error);
    } finally {
      this._cb.onLoading(false);
      this._controller = null;
    }
  }

  private async _consumeSSE(
    response: Response,
    controller: AbortController,
  ): Promise<void> {
    for await (const msg of SSE.consume(response)) {
      if (controller.signal.aborted) break;

      if (msg.event === "stream-id") {
        this._streamId = msg.data;
        this._cb.onStreamId(msg.data);
        continue;
      }
      if (msg.event === "done") {
        try {
          await this._finalize();
        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e));
          this._status = "error";
          this._cb.onError(error);
          this._cb.onStatus("error");
          this._opts.onError?.(error);
          return;
        }
        this._done = true;
        this._cb.onDone(true);
        if (this._status === "streaming" || this._status === "reconnecting") {
          this._status = "done";
          this._cb.onStatus("done");
        }
        return;
      }
      if (msg.event === "usage") {
        try {
          this._cb.onUsage?.(JSON.parse(msg.data) as StreamUsage);
        } catch {
          // Malformed usage payload — ignore
        }
        continue;
      }
      if (msg.event === "stopped") {
        this._status = "stopped";
        this._cb.onStatus("stopped");
        continue;
      }
      if (msg.event === "error") {
        const error = new Error(msg.data);
        this._status = "error";
        this._cb.onError(error);
        this._cb.onStatus("error");
        this._opts.onError?.(error);
        continue;
      }

      // Regular data chunk
      if (msg.id) this._lastSeq = parseInt(msg.id, 10);
      this._processChunk(msg.data);
    }

    // If we exit the loop without a "done" event, the connection was interrupted
    if (!this._done && this._status === "streaming") {
      this._status = "reconnecting";
      this._cb.onStatus("reconnecting");
      await this._reconnect();
    }
  }

  private async _reconnect(): Promise<void> {
    const maxAttempts = this._maxReconnectAttempts;

    while (this._reconnectAttempts < maxAttempts) {
      this._reconnectAttempts++;
      const delay = Math.pow(2, this._reconnectAttempts - 1) * 1000;
      await new Promise((r) => setTimeout(r, delay));

      if (this._status !== "reconnecting") return;

      try {
        const controller = new AbortController();
        this._controller = controller;

        const response = await this._fetch(
          `${this._opts.endpoint}/resume?id=${this._streamId}&after=${this._lastSeq}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error(`Resume failed: ${response.status}`);
        }

        this._status = "streaming";
        this._cb.onStatus("streaming");
        this._cb.onLoading(true);
        this._reconnectAttempts = 0;
        await this._consumeSSE(response, controller);
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        // Continue to next retry
      }
    }

    // All retries exhausted
    this._status = "disconnected";
    this._cb.onStatus("disconnected");
    this._cb.onLoading(false);
    this._cb.onCanResume(true);
  }
}
