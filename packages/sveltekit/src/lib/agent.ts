import { Agent as BaseAgent, type AgentOptions } from "@aibind/svelte/agent";

export type {
  AgentOptions,
  AgentConfig,
  AgentMessage,
  AgentStatus,
} from "@aibind/svelte/agent";
export { ServerAgent } from "@aibind/common";
export type {
  AgentConfig as ServerAgentConfig,
  RunOptions,
} from "@aibind/common";

const DEFAULT_PREFIX = "/api/__aibind__";

/**
 * Client-side reactive agent with SvelteKit defaults.
 * Endpoint defaults to `/api/__aibind__/agent`.
 */
export class Agent extends BaseAgent {
  constructor(
    options: Partial<Pick<AgentOptions, "endpoint">> &
      Omit<AgentOptions, "endpoint"> = {} as any,
  ) {
    super({ endpoint: `${DEFAULT_PREFIX}/agent`, ...options });
  }
}
