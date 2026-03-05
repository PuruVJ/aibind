import { createStreamHandler as createCoreHandler } from "@aibind/core";
import type { StreamHandlerConfig } from "@aibind/core";

export type { StreamHandlerConfig };

/**
 * SvelteKit handle hook for streaming endpoints.
 * Wraps the core stream handler with SvelteKit's event/resolve pattern.
 *
 * @example
 * ```ts
 * // src/hooks.server.ts
 * import { createStreamHandler } from '@aibind/sveltekit/server';
 * import { models } from '$lib/models';
 * export const handle = createStreamHandler({ models });
 * ```
 */
export function createStreamHandler(config: StreamHandlerConfig) {
  const handle = createCoreHandler(config);

  return async function ({
    event,
    resolve,
  }: {
    event: { request: Request; url: URL };
    resolve: (event: unknown) => Promise<Response>;
  }) {
    const response = await handle(event.request);

    // If core returned 404, it's not our route — pass to SvelteKit
    if (response.status === 404) {
      return resolve(event);
    }

    return response;
  };
}
