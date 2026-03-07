/**
 * Framework-agnostic chat controller.
 *
 * Manages a client-side messages[] array, streams assistant replies chunk-by-chunk,
 * and exposes helpers for regenerate and edit-and-resend flows.
 *
 * Framework packages wrap this with reactive primitives ($state, useState, ref, createSignal).
 */

import { consumeTextStream } from "./stream-utils";
import type { ChatCallbacks, BaseChatOptions, ChatMessage, StreamStatus } from "./types";

export class ChatController {
  private _messages: ChatMessage[] = [];
  private _controller: AbortController | null = null;
  private _status: StreamStatus = "idle";

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

  send(content: string): void {
    if (!content.trim()) return;
    this._controller?.abort();

    const userMsg: ChatMessage = { id: this._id(), role: "user", content };
    const assistantMsg: ChatMessage = { id: this._id(), role: "assistant", content: "" };
    this._messages = [...this._messages, userMsg, assistantMsg];
    this._emit();

    this._status = "streaming";
    this._cb.onLoading(true);
    this._cb.onError(null);
    this._cb.onStatus("streaming");

    const controller = new AbortController();
    this._controller = controller;
    this._run(assistantMsg.id, controller);
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
    while (msgs.length > 0 && msgs[msgs.length - 1]!.role === "assistant") msgs.pop();
    const lastUser = msgs[msgs.length - 1];
    if (!lastUser || lastUser.role !== "user") return;
    // Remove the last user message too — send() will re-add it
    msgs.pop();
    this._messages = msgs;
    this._emit();
    this.send(lastUser.content);
  }

  edit(id: string, text: string): void {
    const idx = this._messages.findIndex((m) => m.id === id);
    if (idx === -1) return;
    // Truncate from the edited message onwards and re-send as new user turn
    this._messages = this._messages.slice(0, idx);
    this._emit();
    this.send(text);
  }

  private async _run(assistantId: string, controller: AbortController): Promise<void> {
    // Build the messages payload, excluding the empty assistant placeholder
    const payload = this._messages
      .filter((m) => m.id !== assistantId)
      .map(({ role, content }) => ({ role, content }));

    try {
      const response = await this._fetch(this._opts.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: payload,
          system: this._opts.system,
          model: this._opts.model,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Chat request failed: ${response.status}`);
      }

      for await (const chunk of consumeTextStream(response)) {
        if (controller.signal.aborted) break;
        this._messages = this._messages.map((m) =>
          m.id === assistantId ? { ...m, content: m.content + chunk } : m,
        );
        this._emit();
      }

      this._status = "done";
      this._cb.onStatus("done");
      this._opts.onFinish?.([...this._messages]);
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
