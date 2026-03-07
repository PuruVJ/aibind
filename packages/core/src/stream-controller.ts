/**
 * Framework-agnostic stream controller.
 *
 * Handles all streaming logic: fetch, SSE auto-detection, reconnect,
 * stop/resume, abort. Framework packages create thin wrappers that
 * wire callbacks to their reactive primitives ($state, ref, createSignal).
 */

import { consumeTextStream } from "./stream-utils";
import { SSE } from "./sse";
import type {
  StreamStatus,
  StreamUsage,
  SendOptions,
  UsageRecorder,
  DiffChunk,
  DiffFn,
} from "./types";
import type { Artifact } from "./artifacts";
import type { ChatHistory } from "./chat-history";
import type { ConversationMessage } from "./conversation-store";
import { StreamBroadcaster } from "./broadcast";

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
  onDiff?(chunks: DiffChunk[] | null): void;
  onArtifacts?(artifacts: Artifact[]): void;
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
  /**
   * Accumulate token usage and cost across turns.
   * Updated after every completed stream with the model that was used.
   */
  tracker?: UsageRecorder;
  /**
   * Compute a diff against the previous response after each regenerate/send.
   * - `undefined` (default): built-in word-level LCS diff, zero dependencies
   * - `DiffFn`: plug in any diff library
   * - `false`: disable diffing entirely
   */
  diff?: DiffFn;
  /**
   * Artifact extraction configuration.
   * When set, the stream scans each line through the detector and fires
   * onArtifacts whenever an artifact opens, receives content, or closes.
   */
  artifact?: { detector: import("./artifacts").ArtifactDetector };
}

// --- StreamController ---

export class StreamController {
  protected _text = "";
  private _prevText = "";
  private _controller: AbortController | null = null;
  private _scannedUpTo = 0;
  private _inArtifact = false;
  private _artifacts: Artifact[] = [];
  private _artifactIdSeq = 0;
  private _currentModel: string | undefined = undefined;
  private _lastPrompt = "";
  private _lastOptions: SendOptions | undefined;
  private _lastSeq = 0;
  private _isSSE = false;
  private _reconnectAttempts = 0;
  private _maxReconnectAttempts = 3;
  private _done = false;
  private _status: StreamStatus = "idle";
  private _streamId: string | null = null;
  private _broadcaster: StreamBroadcaster | null = null;
  private _broadcastError: string | null = null;

  protected _opts: StreamControllerOptions;
  protected _cb: StreamCallbacks;

  get text(): string {
    return this._text;
  }

  // --- Broadcast ---

  /**
   * Start broadcasting this stream's state to all tabs/windows listening on
   * the named BroadcastChannel. Returns a cleanup function.
   * No-op when BroadcastChannel is unavailable (e.g. SSR).
   */
  broadcast(channelName: string): () => void {
    if (typeof BroadcastChannel === "undefined") return () => {};
    this._broadcaster?.destroy();
    this._broadcaster = new StreamBroadcaster(channelName);
    this._postBroadcast(); // immediately send current state to late joiners
    return () => {
      this._broadcaster?.destroy();
      this._broadcaster = null;
    };
  }

  private _postBroadcast(): void {
    if (!this._broadcaster) return;
    this._broadcaster.post({
      text: this._text,
      status: this._status,
      loading: this._status === "streaming" || this._status === "reconnecting",
      done: this._done,
      error: this._broadcastError,
    });
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
    this._scanArtifacts();
    this._postBroadcast();
  }

  protected async _finalize(): Promise<void> {
    // If a detector was active and stream ended without a close marker, complete the open artifact.
    if (this._opts.artifact && this._inArtifact && this._artifacts.length > 0) {
      this._artifacts[this._artifacts.length - 1]!.complete = true;
      this._cb.onArtifacts?.([...this._artifacts]);
    }
    this._opts.onFinish?.(this._text);
  }

  protected _resetState(): void {
    this._text = "";
    this._scannedUpTo = 0;
    this._inArtifact = false;
    this._artifacts = [];
    this._broadcastError = null;
    this._cb.onText("");
    if (this._opts.artifact) this._cb.onArtifacts?.([]);
    this._postBroadcast();
  }

  private _scanArtifacts(): void {
    const detector = this._opts.artifact?.detector;
    if (!detector) return;

    const unseen = this._text.slice(this._scannedUpTo);
    const newlineIdx = unseen.lastIndexOf("\n");
    if (newlineIdx === -1) return; // no complete lines yet

    const toScan = unseen.slice(0, newlineIdx);
    this._scannedUpTo += newlineIdx + 1;

    let changed = false;
    for (const line of toScan.split("\n")) {
      const result = detector(line, this._inArtifact);
      if (!result) continue;

      if (result.type === "open") {
        const id = result.id ?? `artifact-${++this._artifactIdSeq}`;
        this._artifacts.push({
          id,
          language: result.language,
          title: result.title,
          content: "",
          complete: false,
        });
        this._inArtifact = true;
        changed = true;
      } else if (result.type === "content" && this._inArtifact) {
        const artifact = this._artifacts[this._artifacts.length - 1]!;
        artifact.content = artifact.content
          ? artifact.content + "\n" + result.text
          : result.text;
        changed = true;
      } else if (result.type === "close" && this._inArtifact) {
        this._artifacts[this._artifacts.length - 1]!.complete = true;
        this._inArtifact = false;
        changed = true;
      }
    }

    if (changed) this._cb.onArtifacts?.([...this._artifacts]);
  }

  private _computeAndEmitDiff(): void {
    if (!this._cb.onDiff || !this._opts.diff || !this._prevText) return;
    this._cb.onDiff(this._opts.diff(this._prevText, this._text));
  }

  // --- Public API ---

  send(prompt: string, options?: SendOptions): void {
    this._controller?.abort();
    this._prevText = this._text; // capture before reset for diff
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
    this._cb.onDiff?.(null);
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
      this._currentModel = model;
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
        this._postBroadcast();
        this._computeAndEmitDiff();
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
      this._broadcastError = error.message;
      this._status = "error";
      this._cb.onError(error);
      this._cb.onStatus("error");
      this._postBroadcast();
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
        this._postBroadcast();
        this._computeAndEmitDiff();
        return;
      }
      if (msg.event === "usage") {
        try {
          const usage = JSON.parse(msg.data) as StreamUsage;
          this._opts.tracker?.record(usage, this._currentModel);
          this._cb.onUsage?.(usage);
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
