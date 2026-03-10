/**
 * Framework-agnostic chat controller.
 *
 * Manages a client-side messages[] array, streams assistant replies chunk-by-chunk,
 * and exposes helpers for regenerate and edit-and-resend flows.
 *
 * Framework packages wrap this with reactive primitives ($state, useState, ref, createSignal).
 */

import { SSE } from "./sse";
import { consumeTextStream } from "./stream-utils";
import type {
  ChatCallbacks,
  BaseChatOptions,
  ChatMessage,
  ChatSendOptions,
  StagedMessage,
  StreamStatus,
} from "./types";

export class ChatController {
  private _messages: ChatMessage[] = [];
  private _controller: AbortController | null = null;
  private _status: StreamStatus = "idle";
  private _stagedUserId: string | null = null;
  private _stagedAssistantId: string | null = null;
  private _title: string | null = null;
  private _titleLoading = false;
  private _titleGenerated = false;

  private readonly _opts: BaseChatOptions;
  private readonly _cb: ChatCallbacks;

  constructor(opts: BaseChatOptions, callbacks: ChatCallbacks) {
    if (!opts.endpoint) throw new Error("@aibind: `endpoint` is required.");
    this._opts = opts;
    this._cb = callbacks;
  }

  get messages(): ChatMessage[] {
    return this._messages;
  }

  private get _fetch(): typeof globalThis.fetch {
    return this._opts.fetch ?? globalThis.fetch;
  }

  private _id(): string {
    return crypto.randomUUID();
  }

  private _emit(): void {
    this._cb.onMessages([...this._messages]);
  }

  /**
   * Stage a message in the UI immediately without starting the network request.
   * Returns a handle: call `send()` to start streaming, or `cancel()` to discard.
   *
   * @example
   * ```ts
   * const staged = chat.optimistic(input);
   * input = "";
   * // ... do any pre-send work ...
   * staged.send();
   * ```
   */
  optimistic(content: string, opts?: ChatSendOptions): StagedMessage {
    if (!content.trim()) return { send: () => {}, cancel: () => {} };
    this._discardStaged();
    this._controller?.abort();

    const userMsg: ChatMessage = {
      id: this._id(),
      role: "user",
      content,
      optimistic: true,
      attachments: opts?.attachments,
    };
    const assistantMsg: ChatMessage = {
      id: this._id(),
      role: "assistant",
      content: "",
      optimistic: true,
    };
    this._stagedUserId = userMsg.id;
    this._stagedAssistantId = assistantMsg.id;
    this._messages = [...this._messages, userMsg, assistantMsg];
    this._emit();

    let consumed = false;
    return {
      send: () => {
        if (consumed) return;
        consumed = true;
        this._flushStaged();
      },
      cancel: () => {
        if (consumed) return;
        consumed = true;
        this._discardStaged();
      },
    };
  }

  private _discardStaged(): void {
    const uid = this._stagedUserId;
    const aid = this._stagedAssistantId;
    if (!uid && !aid) return;
    this._messages = this._messages.filter((m) => m.id !== uid && m.id !== aid);
    this._stagedUserId = null;
    this._stagedAssistantId = null;
    this._emit();
  }

  private _flushStaged(): void {
    const uid = this._stagedUserId;
    const aid = this._stagedAssistantId;
    if (!uid || !aid) return;
    this._stagedUserId = null;
    this._stagedAssistantId = null;

    this._status = "streaming";
    this._cb.onLoading(true);
    this._cb.onError(null);
    this._cb.onStatus("streaming");

    const controller = new AbortController();
    this._controller = controller;
    this._run(uid, aid, controller);
  }

  send(content: string, opts?: ChatSendOptions): void {
    if (!content.trim()) return;
    this._discardStaged();
    this._controller?.abort();

    const userMsg: ChatMessage = {
      id: this._id(),
      role: "user",
      content,
      optimistic: true,
      attachments: opts?.attachments,
    };
    const assistantMsg: ChatMessage = {
      id: this._id(),
      role: "assistant",
      content: "",
      optimistic: true,
    };
    this._messages = [...this._messages, userMsg, assistantMsg];
    this._emit();

    this._status = "streaming";
    this._cb.onLoading(true);
    this._cb.onError(null);
    this._cb.onStatus("streaming");

    const controller = new AbortController();
    this._controller = controller;
    this._run(userMsg.id, assistantMsg.id, controller);
  }

  /**
   * Undo the most recent `send()`.
   * Aborts if still streaming, removes the user+assistant pair from messages,
   * and returns the user message text so callers can restore it to an input.
   * Returns `null` if there is nothing to revert.
   */
  revert(): string | null {
    this.abort();
    const msgs = [...this._messages];
    while (msgs.length && msgs[msgs.length - 1]!.role === "assistant")
      msgs.pop();
    const lastUser = msgs[msgs.length - 1];
    if (!lastUser || lastUser.role !== "user") return null;
    msgs.pop();
    this._messages = msgs;
    this._cb.onError(null);
    this._status = "idle";
    this._cb.onStatus("idle");
    this._cb.onLoading(false);
    this._emit();
    return lastUser.content;
  }

  abort(): void {
    this._controller?.abort();
    this._controller = null;
    if (this._status === "streaming") {
      this._status = "idle";
      this._cb.onStatus("idle");
      this._cb.onLoading(false);
    }
  }

  clear(): void {
    this.abort();
    this._messages = [];
    this._emit();
  }

  regenerate(): void {
    const msgs = [...this._messages];
    // Remove trailing assistant messages
    while (msgs.length > 0 && msgs[msgs.length - 1]!.role === "assistant")
      msgs.pop();
    const lastUser = msgs[msgs.length - 1];
    if (!lastUser || lastUser.role !== "user") return;
    // Remove the last user message too — send() will re-add it
    msgs.pop();
    this._messages = msgs;
    this._emit();
    this.send(lastUser.content, { attachments: lastUser.attachments });
  }

  edit(id: string, text: string, opts?: ChatSendOptions): void {
    const idx = this._messages.findIndex((m) => m.id === id);
    if (idx === -1) return;
    // Truncate from the edited message onwards and re-send as new user turn
    this._messages = this._messages.slice(0, idx);
    this._emit();
    this.send(text, opts);
  }

  /**
   * Generate a short title for the current conversation and stream it into
   * `chat.title` character by character.
   *
   * Called automatically after the first turn when `autoTitle: true`.
   * Can also be called manually at any point to refresh the title.
   */
  async generateTitle(opts?: { model?: string }): Promise<void> {
    const messages = this._messages.filter(
      (m) =>
        !m.optimistic &&
        (m.role === "user" || m.role === "assistant") &&
        m.content,
    );
    if (messages.length === 0) return;

    this._titleLoading = true;
    this._cb.onTitleLoading(true);
    this._title = "";
    this._cb.onTitle("");

    const endpoint = this._opts.titleEndpoint ?? "/__aibind__/title";

    try {
      const response = await this._fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages
            .slice(0, 6)
            .map(({ role, content }) => ({ role, content })),
          model: opts?.model ?? this._opts.model,
        }),
      });

      if (!response.ok) throw new Error(`Title request failed: ${response.status}`);

      for await (const chunk of consumeTextStream(response)) {
        this._title += chunk;
        this._cb.onTitle(this._title);
      }

      this._titleGenerated = true;
    } catch {
      // Title generation is non-critical — fail silently
    } finally {
      this._titleLoading = false;
      this._cb.onTitleLoading(false);
    }
  }

  private async _run(
    userId: string,
    assistantId: string,
    controller: AbortController,
  ): Promise<void> {
    // Build the messages payload — exclude the assistant placeholder and tool messages
    const payload = this._messages
      .filter((m) => m.id !== assistantId && m.role !== "tool")
      .map(({ role, content, attachments }) => ({
        role,
        content,
        ...(attachments?.length ? { attachments } : {}),
      }));

    try {
      const response = await this._fetch(this._opts.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: payload,
          system: this._opts.system,
          model: this._opts.model,
          toolset: this._opts.toolset,
          maxSteps: this._opts.maxSteps,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Chat request failed: ${response.status}`);
      }

      let confirmed = false;
      for await (const msg of SSE.consume(response)) {
        if (controller.signal.aborted) break;

        if (msg.event === "tool_call") {
          try {
            const { name, args } = JSON.parse(msg.data) as {
              name: string;
              args: unknown;
            };
            this._opts.onToolCall?.(name, args);
            // Insert a tool message before the assistant placeholder
            const toolMsg: ChatMessage = {
              id: this._id(),
              role: "tool",
              content: "",
              toolName: name,
              toolArgs: args,
            };
            const assistantIdx = this._messages.findIndex(
              (m) => m.id === assistantId,
            );
            this._messages =
              assistantIdx !== -1
                ? [
                    ...this._messages.slice(0, assistantIdx),
                    toolMsg,
                    ...this._messages.slice(assistantIdx),
                  ]
                : [...this._messages, toolMsg];
            this._emit();
          } catch {
            // Malformed tool_call payload — ignore
          }
          continue;
        }
        if (msg.event === "usage") continue;
        if (msg.event === "stream-id") continue;
        if (msg.event === "stopped") continue;
        if (msg.event === "error") throw new Error(msg.data);
        if (msg.event === "done") break;

        // Regular text chunk
        const chunk = msg.data;
        if (!confirmed) {
          // First chunk — mark both messages as confirmed (no longer optimistic)
          this._messages = this._messages.map((m) =>
            m.id === userId || m.id === assistantId
              ? { ...m, optimistic: false }
              : m,
          );
          confirmed = true;
        }
        this._messages = this._messages.map((m) =>
          m.id === assistantId ? { ...m, content: m.content + chunk } : m,
        );
        this._emit();
      }

      // If stream ended without any chunks, still confirm the optimistic messages
      if (!confirmed) {
        this._messages = this._messages.map((m) =>
          m.id === userId || m.id === assistantId
            ? { ...m, optimistic: false }
            : m,
        );
        this._emit();
      }

      this._status = "done";
      this._cb.onStatus("done");
      this._opts.onFinish?.([...this._messages]);
      if (this._opts.autoTitle && !this._titleGenerated) {
        void this.generateTitle();
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
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
}
