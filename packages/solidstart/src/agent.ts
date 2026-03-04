import {
  useAgent as baseUseAgent,
  type AgentOptions,
} from "@aibind/solid/agent";

export type {
  AgentOptions,
  AgentMessage,
  AgentStatus,
} from "@aibind/solid/agent";
export { ServerAgent } from "@aibind/core";
export type { AgentConfig, RunOptions } from "@aibind/core";

const DEFAULT_PREFIX = "/__aibind__";

/**
 * Reactive agent hook with SolidStart defaults.
 * Endpoint defaults to `/__aibind__/agent`.
 */
export function useAgent(
  options: Partial<Pick<AgentOptions, "endpoint">> &
    Omit<AgentOptions, "endpoint"> = {} as any,
): ReturnType<typeof baseUseAgent> {
  return baseUseAgent({ endpoint: `${DEFAULT_PREFIX}/agent`, ...options });
}
