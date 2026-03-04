import {
	useAgent as baseUseAgent,
	type AgentOptions,
} from '@aibind/solid/agent';

export type { AgentOptions, AgentMessage, AgentStatus } from '@aibind/solid/agent';
export { ServerAgent } from '@aibind/common';
export type { AgentConfig, RunOptions } from '@aibind/common';

const DEFAULT_PREFIX = '/api/__aibind__';

/**
 * Reactive agent hook with SolidStart defaults.
 * Endpoint defaults to `/api/__aibind__/agent`.
 */
export function useAgent(
	options: Partial<Pick<AgentOptions, 'endpoint'>> & Omit<AgentOptions, 'endpoint'> = {} as any
) {
	return baseUseAgent({ endpoint: `${DEFAULT_PREFIX}/agent`, ...options });
}
