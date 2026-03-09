import { createSignal, onCleanup } from "solid-js";
import type { Accessor } from "solid-js";
import {
  AgentController,
  type AgentCallbacks,
  type AgentStatus,
  type AgentMessage,
  type AgentOptions,
} from "@aibind/core";

export type { AgentOptions } from "@aibind/core";

export interface UseAgentReturn {
  messages: Accessor<AgentMessage[]>;
  status: Accessor<AgentStatus>;
  error: Accessor<Error | null>;
  pendingApproval: Accessor<{
    id: string;
    toolName: string;
    args: unknown;
  } | null>;
  /** The name of the graph node currently executing, or `null` when idle. */
  currentNode: Accessor<string | null>;
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
  const [messages, setMessages] = createSignal<AgentMessage[]>([]);
  const [status, setStatus] = createSignal<AgentStatus>("idle");
  const [error, setError] = createSignal<Error | null>(null);
  const [pendingApproval, setPendingApproval] = createSignal<{
    id: string;
    toolName: string;
    args: unknown;
  } | null>(null);
  const [currentNode, setCurrentNode] = createSignal<string | null>(null);

  const ctrl = new AgentController(options, {
    onMessages: (m) => setMessages(m),
    onStatus: (s) => setStatus(s),
    onError: (e) => setError(e),
    onPendingApproval: (pa) => setPendingApproval(pa),
    onCurrentNode: (node) => setCurrentNode(node),
  } satisfies AgentCallbacks);

  onCleanup(() => ctrl.stop());

  return {
    messages,
    status,
    error,
    pendingApproval,
    currentNode,
    send: (prompt: string) => ctrl.send(prompt),
    stop: () => ctrl.stop(),
    approve: (id: string) => {
      ctrl.setPendingApproval(pendingApproval());
      ctrl.setStatus(status());
      ctrl.approve(id);
    },
    deny: (id: string, reason?: string) => {
      ctrl.setPendingApproval(pendingApproval());
      ctrl.setStatus(status());
      ctrl.deny(id, reason);
    },
  };
}
