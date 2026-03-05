/**
 * Framework-agnostic agent controller.
 *
 * Handles all agent logic: message management, fetch, streaming,
 * approval flow. Framework packages create thin wrappers that wire
 * callbacks to their reactive primitives ($state, ref, createSignal).
 */

import { consumeTextStream } from "./stream-utils";
import type { AgentStatus, AgentMessage, AgentOptions } from "./types";

// --- Callbacks ---

export interface AgentCallbacks {
  onMessages(messages: AgentMessage[]): void;
  onStatus(status: AgentStatus): void;
  onError(error: Error | null): void;
  onPendingApproval(
    pa: { id: string; toolName: string; args: unknown } | null,
  ): void;
}

// --- AgentController ---

export class AgentController {
  private _messages: AgentMessage[] = [];
  private _controller: AbortController | null = null;
  private _pendingApproval: {
    id: string;
    toolName: string;
    args: unknown;
  } | null = null;
  private _status: AgentStatus = "idle";

  private _opts: AgentOptions;
  private _cb: AgentCallbacks;

  private get _fetch(): typeof globalThis.fetch {
    return this._opts.fetch ?? globalThis.fetch;
  }

  constructor(options: AgentOptions, callbacks: AgentCallbacks) {
    if (!options.endpoint) {
      throw new Error("@aibind: Agent requires an `endpoint` option.");
    }
    this._opts = options;
    this._cb = callbacks;
  }

  get messages(): AgentMessage[] {
    return this._messages;
  }

  async send(prompt: string): Promise<void> {
    this._controller?.abort();
    this._status = "running";
    this._cb.onStatus("running");
    this._cb.onError(null);

    const userMsg: AgentMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
      type: "text",
    };
    this._messages = [...this._messages, userMsg];
    this._cb.onMessages(this._messages);

    const controller = new AbortController();
    this._controller = controller;

    try {
      const response = await this._fetch(this._opts.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: this._messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok)
        throw new Error(`Agent request failed: ${response.status}`);

      const assistantMsg: AgentMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        type: "text",
      };
      this._messages = [...this._messages, assistantMsg];
      this._cb.onMessages(this._messages);

      for await (const chunk of consumeTextStream(response)) {
        if (controller.signal.aborted) break;
        assistantMsg.content += chunk;
        this._messages = [...this._messages.slice(0, -1), { ...assistantMsg }];
        this._cb.onMessages(this._messages);
      }

      this._status = "idle";
      this._cb.onStatus("idle");
      this._opts.onMessage?.(assistantMsg);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        this._status = "idle";
        this._cb.onStatus("idle");
        return;
      }

      const error = e instanceof Error ? e : new Error(String(e));
      this._status = "error";
      this._cb.onError(error);
      this._cb.onStatus("error");
      this._opts.onError?.(error);
    } finally {
      this._controller = null;
    }
  }

  approve(id: string): void {
    if (!this._pendingApproval || this._pendingApproval.id !== id) return;
    this._pendingApproval = null;
    this._cb.onPendingApproval(null);
    this._status = "running";
    this._cb.onStatus("running");
  }

  deny(id: string, _reason?: string): void {
    if (!this._pendingApproval || this._pendingApproval.id !== id) return;
    this._pendingApproval = null;
    this._cb.onPendingApproval(null);
    this._status = "idle";
    this._cb.onStatus("idle");
  }

  stop(): void {
    this._controller?.abort();
    this._controller = null;
    this._status = "idle";
    this._cb.onStatus("idle");
  }

  /** Set pending approval (used by framework wrappers for testing). */
  setPendingApproval(
    pa: { id: string; toolName: string; args: unknown } | null,
  ): void {
    this._pendingApproval = pa;
    this._cb.onPendingApproval(pa);
  }

  setStatus(status: AgentStatus): void {
    this._status = status;
    this._cb.onStatus(status);
  }
}
