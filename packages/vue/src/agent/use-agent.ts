import { ref, onUnmounted } from "vue";
import type { Ref } from "vue";
import {
  AgentController,
  type AgentCallbacks,
  type AgentStatus,
  type AgentMessage,
  type AgentOptions,
} from "@aibind/core";

export type { AgentOptions } from "@aibind/core";

export interface UseAgentReturn {
  messages: Ref<AgentMessage[]>;
  status: Ref<AgentStatus>;
  error: Ref<Error | null>;
  pendingApproval: Ref<{ id: string; toolName: string; args: unknown } | null>;
  send: (prompt: string) => Promise<void>;
  stop: () => void;
  approve: (id: string) => void;
  deny: (id: string, reason?: string) => void;
}

/**
 * Reactive agent composable.
 * Streams responses from a server-side agent endpoint.
 * Call inside a component's `setup()`.
 */
export function useAgent(options: AgentOptions): UseAgentReturn {
  const messages: Ref<AgentMessage[]> = ref([]);
  const status: Ref<AgentStatus> = ref("idle");
  const error: Ref<Error | null> = ref(null);
  const pendingApproval: Ref<{
    id: string;
    toolName: string;
    args: unknown;
  } | null> = ref(null);

  const ctrl = new AgentController(options, {
    onMessages: (m) => {
      messages.value = m;
    },
    onStatus: (s) => {
      status.value = s;
    },
    onError: (e) => {
      error.value = e;
    },
    onPendingApproval: (pa) => {
      pendingApproval.value = pa;
    },
  } satisfies AgentCallbacks);

  onUnmounted(() => ctrl.stop());

  return {
    messages,
    status,
    error,
    pendingApproval,
    send: (prompt: string) => ctrl.send(prompt),
    stop: () => ctrl.stop(),
    approve: (id: string) => {
      ctrl.setPendingApproval(pendingApproval.value);
      ctrl.setStatus(status.value);
      ctrl.approve(id);
    },
    deny: (id: string, reason?: string) => {
      ctrl.setPendingApproval(pendingApproval.value);
      ctrl.setStatus(status.value);
      ctrl.deny(id, reason);
    },
  };
}
