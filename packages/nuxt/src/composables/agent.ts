import { useAgent as baseUseAgent, type AgentOptions } from "@aibind/vue/agent";

export type {
  AgentOptions,
  AgentMessage,
  AgentStatus,
} from "@aibind/vue/agent";
export { ServerAgent } from "@aibind/common";
export type { AgentConfig, RunOptions } from "@aibind/common";

const DEFAULT_PREFIX = "/api/__aibind__";

/**
 * Reactive agent composable with Nuxt defaults.
 * Endpoint defaults to `/api/__aibind__/agent`.
 */
export function useAgent(
  options: Partial<Pick<AgentOptions, "endpoint">> &
    Omit<AgentOptions, "endpoint"> = {} as any,
): ReturnType<typeof baseUseAgent> {
  return baseUseAgent({ endpoint: `${DEFAULT_PREFIX}/agent`, ...options });
}
