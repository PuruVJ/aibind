import {
	useStream as baseUseStream,
	useStructuredStream as baseUseStructuredStream,
	defineModels,
	type UseStreamReturn,
	type StreamOptions,
	type StructuredStreamOptions,
} from '@aibind/solid';

export { defineModels } from '@aibind/solid';
export type { SendOptions, DeepPartial, LanguageModel, StreamOptions, StructuredStreamOptions } from '@aibind/solid';

const DEFAULT_PREFIX = '/api/__aibind__';

/**
 * Reactive streaming text hook with SolidStart defaults.
 * Endpoint defaults to `/api/__aibind__/stream`.
 */
export function useStream<M extends string = string>(
	options: Partial<Pick<StreamOptions<M>, 'endpoint'>> & Omit<StreamOptions<M>, 'endpoint'> = {} as any
): UseStreamReturn {
	return baseUseStream({ endpoint: `${DEFAULT_PREFIX}/stream`, ...options });
}

/**
 * Reactive structured streaming hook with SolidStart defaults.
 * Endpoint defaults to `/api/__aibind__/structured`.
 */
export function useStructuredStream<M extends string, T>(
	options: Partial<Pick<StructuredStreamOptions<T, M>, 'endpoint'>> & Omit<StructuredStreamOptions<T, M>, 'endpoint'>
): ReturnType<typeof baseUseStructuredStream<M, T>> {
	return baseUseStructuredStream({ endpoint: `${DEFAULT_PREFIX}/structured`, ...options });
}
