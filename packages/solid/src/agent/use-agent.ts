import { createSignal, onCleanup } from "solid-js";
import type { Accessor } from "solid-js";
import type { AgentStatus, AgentMessage, AgentOptions } from "../types.js";
import { consumeTextStream } from "@aibind/core";

export type { AgentOptions } from "../types.js";

export interface UseAgentReturn {
  messages: Accessor<AgentMessage[]>;
  status: Accessor<AgentStatus>;
  error: Accessor<Error | null>;
  pendingApproval: Accessor<{
    id: string;
    toolName: string;
    args: unknown;
  } | null>;
  send: (prompt: string) => Promise<void>;
  stop: () => void;
  approve: (id: string) => void;
  deny: (id: string, reason?: string) => void;
}

/**
 * Reactive agent hook.
 * Streams responses from a server-side agent endpoint.
 * Call inside a component.
 */
export function useAgent(options: AgentOptions): UseAgentReturn {
  if (!options.endpoint) {
    throw new Error(
      "@aibind/solid: useAgent requires an `endpoint` option. If using @aibind/solidstart, endpoints are configured automatically.",
    );
  }

  const [messages, setMessages] = createSignal<AgentMessage[]>([]);
  const [status, setStatus] = createSignal<AgentStatus>("idle");
  const [error, setError] = createSignal<Error | null>(null);
  const [pendingApproval, setPendingApproval] = createSignal<{
    id: string;
    toolName: string;
    args: unknown;
  } | null>(null);

  let controller: AbortController | null = null;

  async function send(prompt: string) {
    controller?.abort();
    setStatus("running");
    setError(null);

    const userMsg: AgentMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
      type: "text",
    };
    setMessages((prev) => [...prev, userMsg]);

    const ctrl = new AbortController();
    controller = ctrl;

    try {
      const endpoint = options.endpoint;
      const fetcher = options.fetch ?? globalThis.fetch;
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages().map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
        signal: ctrl.signal,
      });

      if (!response.ok)
        throw new Error(`Agent request failed: ${response.status}`);

      const assistantMsg: AgentMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        type: "text",
      };
      setMessages((prev) => [...prev, assistantMsg]);

      for await (const chunk of consumeTextStream(response)) {
        if (ctrl.signal.aborted) break;
        assistantMsg.content += chunk;
        // Trigger reactivity by replacing the array
        setMessages((prev) => [...prev.slice(0, -1), { ...assistantMsg }]);
      }

      setStatus("idle");
      options.onMessage?.(assistantMsg);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setStatus("idle");
        return;
      }

      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      setStatus("error");
      options.onError?.(err);
    } finally {
      controller = null;
    }
  }

  function approve(id: string) {
    if (!pendingApproval() || pendingApproval()!.id !== id) return;
    setPendingApproval(null);
    setStatus("running");
  }

  function deny(id: string, _reason?: string) {
    if (!pendingApproval() || pendingApproval()!.id !== id) return;
    setPendingApproval(null);
    setStatus("idle");
  }

  function stop() {
    controller?.abort();
    controller = null;
    setStatus("idle");
  }

  onCleanup(() => stop());

  return {
    messages,
    status,
    error,
    pendingApproval,
    send,
    stop,
    approve,
    deny,
  };
}
