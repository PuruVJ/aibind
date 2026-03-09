/**
 * Framework-agnostic agent controller.
 *
 * Handles all agent logic: message management, fetch, streaming,
 * approval flow. Framework packages create thin wrappers that wire
 * callbacks to their reactive primitives ($state, ref, createSignal).
 */

import { consumeTextStream } from "./stream-utils";
import { AgentStream } from "./agent-stream";
import type { AgentStatus, AgentMessage, AgentOptions } from "./types";

// --- Callbacks ---

export interface AgentCallbacks {
  onMessages(messages: AgentMessage[]): void;
  onStatus(status: AgentStatus): void;
  onError(error: Error | null): void;
  onPendingApproval(
    pa: { id: string; toolName: string; args: unknown } | null,
  ): void;
  /** Called when the active graph node changes (graph agents only). */
  onCurrentNode(node: string | null): void;
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
  private _currentNode: string | null = null;

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

  /** The name of the graph node currently executing, or `null` when idle. */
  get currentNode(): string | null {
    return this._currentNode;
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
          ...(this._opts.toolset != null && { toolset: this._opts.toolset }),
        }),
        signal: controller.signal,
      });

      if (!response.ok)
        throw new Error(`Agent request failed: ${response.status}`);

      // Detect graph agents (NDJSON) vs plain-text agents
      const contentType = response.headers.get("Content-Type") ?? "";
      if (contentType.includes("application/x-ndjson")) {
        await this._consumeNdjson(response, controller);
      } else {
        await this._consumePlainText(response, controller);
      }

      this._status = "idle";
      this._cb.onStatus("idle");
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

  private async _consumePlainText(
    response: Response,
    controller: AbortController,
  ): Promise<void> {
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

    this._opts.onMessage?.(assistantMsg);
  }

  private async _consumeNdjson(
    response: Response,
    controller: AbortController,
  ): Promise<void> {
    // One assistant message per graph node — created on first text-delta for that node
    let currentAssistantMsg: AgentMessage | null = null;

    const finalizeCurrentMsg = (): void => {
      if (currentAssistantMsg) {
        this._opts.onMessage?.(currentAssistantMsg);
        currentAssistantMsg = null;
      }
    };

    for await (const event of AgentStream.consume(response)) {
      if (controller.signal.aborted) break;

      switch (event.type) {
        case "node-enter": {
          finalizeCurrentMsg();
          this._currentNode = event.node;
          this._cb.onCurrentNode(event.node);
          // Create a placeholder assistant message stamped with the node id
          currentAssistantMsg = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "",
            type: "text",
            nodeId: event.node,
          };
          this._messages = [...this._messages, currentAssistantMsg];
          this._cb.onMessages(this._messages);
          break;
        }

        case "node-exit": {
          finalizeCurrentMsg();
          // Keep currentNode set until the next node-enter (or done)
          break;
        }

        case "text-delta": {
          const cur: AgentMessage | null = currentAssistantMsg;
          if (cur) {
            const updated: AgentMessage = {
              ...cur,
              content: cur.content + event.text,
            };
            currentAssistantMsg = updated;
            this._messages = [
              ...this._messages.slice(0, -1),
              updated,
            ];
            this._cb.onMessages(this._messages);
          }
          break;
        }

        case "tool-call": {
          const toolMsg: AgentMessage = {
            id: crypto.randomUUID(),
            role: "tool",
            content: "",
            type: "tool-call",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.args,
            toolStatus: "running",
            nodeId: this._currentNode ?? undefined,
          };
          // Insert before current assistant placeholder
          if (currentAssistantMsg) {
            const idx = this._messages.findIndex(
              (m) => m.id === currentAssistantMsg!.id,
            );
            this._messages =
              idx !== -1
                ? [
                    ...this._messages.slice(0, idx),
                    toolMsg,
                    ...this._messages.slice(idx),
                  ]
                : [...this._messages, toolMsg];
          } else {
            this._messages = [...this._messages, toolMsg];
          }
          this._cb.onMessages(this._messages);
          break;
        }

        case "tool-result": {
          this._messages = this._messages.map((m) =>
            m.toolCallId === event.toolCallId
              ? { ...m, result: event.result, toolStatus: "completed" as const }
              : m,
          );
          this._cb.onMessages(this._messages);
          break;
        }

        case "tool-result-error": {
          this._messages = this._messages.map((m) =>
            m.toolCallId === event.toolCallId
              ? {
                  ...m,
                  toolError: event.error,
                  toolStatus: "error" as const,
                }
              : m,
          );
          this._cb.onMessages(this._messages);
          break;
        }

        case "approval-request": {
          const pa = {
            id: event.approvalId,
            toolName: event.toolName,
            args: event.args,
          };
          this._pendingApproval = pa;
          this._status = "awaiting-approval";
          this._cb.onPendingApproval(pa);
          this._cb.onStatus("awaiting-approval");
          break;
        }

        case "error": {
          throw new Error(event.error);
        }

        case "done": {
          finalizeCurrentMsg();
          this._currentNode = null;
          this._cb.onCurrentNode(null);
          break;
        }
      }
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
    if (this._currentNode !== null) {
      this._currentNode = null;
      this._cb.onCurrentNode(null);
    }
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
