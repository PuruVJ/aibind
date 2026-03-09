import { useState, useEffect, useRef } from "react";
import {
  AgentController,
  type AgentCallbacks,
  type AgentStatus,
  type AgentMessage,
  type AgentOptions,
} from "@aibind/core";

export type { AgentOptions } from "@aibind/core";

export interface UseAgentReturn {
  messages: AgentMessage[];
  status: AgentStatus;
  error: Error | null;
  pendingApproval: { id: string; toolName: string; args: unknown } | null;
  /** The name of the graph node currently executing, or `null` when idle. */
  currentNode: string | null;
  send: (prompt: string) => Promise<void>;
  stop: () => void;
  approve: (id: string) => void;
  deny: (id: string, reason?: string) => void;
}

/**
 * React hook for interacting with a server-side AI agent.
 *
 * @example
 * ```tsx
 * const { messages, send, status } = useAgent({ endpoint: '/api/agent' });
 * ```
 */
export function useAgent(options: AgentOptions): UseAgentReturn {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [pendingApproval, setPendingApproval] = useState<{
    id: string;
    toolName: string;
    args: unknown;
  } | null>(null);
  const [currentNode, setCurrentNode] = useState<string | null>(null);

  const ctrlRef = useRef<AgentController | null>(null);

  if (!ctrlRef.current) {
    ctrlRef.current = new AgentController(options, {
      onMessages: setMessages,
      onStatus: setStatus,
      onError: setError,
      onPendingApproval: setPendingApproval,
      onCurrentNode: setCurrentNode,
    } satisfies AgentCallbacks);
  }

  useEffect(() => () => ctrlRef.current?.stop(), []);

  // We need refs for approve/deny since they access current state
  const stateRef = useRef({ pendingApproval, status });
  stateRef.current = { pendingApproval, status };

  return {
    messages,
    status,
    error,
    pendingApproval,
    currentNode,
    send: (prompt: string) => ctrlRef.current!.send(prompt),
    stop: () => ctrlRef.current!.stop(),
    approve: (id: string) => {
      ctrlRef.current!.setPendingApproval(stateRef.current.pendingApproval);
      ctrlRef.current!.setStatus(stateRef.current.status);
      ctrlRef.current!.approve(id);
    },
    deny: (id: string, reason?: string) => {
      ctrlRef.current!.setPendingApproval(stateRef.current.pendingApproval);
      ctrlRef.current!.setStatus(stateRef.current.status);
      ctrlRef.current!.deny(id, reason);
    },
  };
}
