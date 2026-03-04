import { Agent as BaseAgent, type AgentOptions } from "@aibind/svelte/agent";

export type {
  AgentOptions,
  AgentConfig,
  AgentMessage,
  AgentStatus,
} from "@aibind/svelte/agent";
export { ServerAgent } from "@aibind/core";
export type {
  AgentConfig as ServerAgentConfig,
  RunOptions,
} from "@aibind/core";

const DEFAULT_PREFIX = "/__aibind__";

/**
 * Client-side reactive agent with SvelteKit defaults.
 * Endpoint defaults to `/__aibind__/agent`.
 */
export class Agent extends BaseAgent {
  constructor(
    options: Partial<Pick<AgentOptions, "endpoint">> &
      Omit<AgentOptions, "endpoint"> = {} as any,
  ) {
    super({ endpoint: `${DEFAULT_PREFIX}/agent`, ...options });
  }
}
