import { onDestroy } from "svelte";
import {
  AgentController,
  type AgentCallbacks,
  type AgentStatus,
  type AgentMessage,
  type AgentOptions,
} from "@aibind/core";

export type { AgentOptions } from "@aibind/core";

/**
 * Client-side reactive agent state.
 * Streams responses from a server-side agent endpoint.
 * Instantiate in a component's <script> block.
 */
export class Agent {
  messages: AgentMessage[] = $state([]);
  status: AgentStatus = $state("idle");
  error: Error | null = $state(null);
  pendingApproval: { id: string; toolName: string; args: unknown } | null =
    $state(null);
  /** The name of the graph node currently executing, or `null` when idle. */
  currentNode: string | null = $state(null);

  #ctrl: AgentController;

  constructor(options: AgentOptions) {
    this.#ctrl = new AgentController(options, {
      onMessages: (m) => {
        this.messages = m;
      },
      onStatus: (s) => {
        this.status = s;
      },
      onError: (e) => {
        this.error = e;
      },
      onPendingApproval: (pa) => {
        this.pendingApproval = pa;
      },
      onCurrentNode: (node) => {
        this.currentNode = node;
      },
    } satisfies AgentCallbacks);
    onDestroy(() => this.stop());
  }

  send(prompt: string): Promise<void> {
    return this.#ctrl.send(prompt);
  }

  approve(id: string): void {
    // Sync local state to controller (e.g. when set directly on the class)
    this.#ctrl.setPendingApproval(this.pendingApproval);
    this.#ctrl.setStatus(this.status);
    this.#ctrl.approve(id);
  }

  deny(id: string, reason?: string): void {
    this.#ctrl.setPendingApproval(this.pendingApproval);
    this.#ctrl.setStatus(this.status);
    this.#ctrl.deny(id, reason);
  }

  stop(): void {
    this.#ctrl.stop();
  }
}
