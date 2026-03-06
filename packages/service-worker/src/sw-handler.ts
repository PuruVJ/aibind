/**
 * Service Worker fetch handler for @aibind streaming endpoints.
 *
 * createSWHandler() returns a function you attach to the SW's fetch event.
 * It intercepts requests matching the aibind prefix (default /__aibind__)
 * and responds with a streaming SSE response — exactly the same protocol
 * the framework server handlers (createStreamHandler in sveltekit, nextjs, etc.)
 * use. The client-side Stream class doesn't know the difference.
 *
 * The SW uses event.waitUntil() to stay alive for the full duration of
 * the stream, ensuring all IndexedDB writes complete before the SW is
 * eligible to be killed by the browser.
 *
 * @example
 * ```ts
 * // sw.ts
 * import { createSWHandler, IDBStreamStore, IDBConversationStore } from "@aibind/service-worker";
 * import { createOpenRouter } from "@openrouter/ai-sdk-provider";
 *
 * const openrouter = createOpenRouter({ apiKey: "sk-..." });
 *
 * const store = new IDBStreamStore();
 * const conversation = new IDBConversationStore();
 *
 * const handler = createSWHandler({
 *   models: {
 *     fast: openrouter("google/gemini-3.1-flash-lite-preview"),
 *     smart: openrouter("openai/gpt-5-mini"),
 *   },
 *   resumable: true,
 *   store,
 *   conversation: { store: conversation },
 * });
 *
 * self.addEventListener("fetch", handler);
 * ```
 */

import { StreamHandler } from "@aibind/core";
import type { StreamHandlerConfig } from "@aibind/core";

export type { StreamHandlerConfig };

/**
 * Minimal interface for a Service Worker fetch event.
 * Structurally compatible with the browser's FetchEvent — avoids a lib dependency.
 */
export interface SWFetchEvent {
  readonly request: Request;
  respondWith(r: Response | Promise<Response>): void;
  waitUntil(p: Promise<unknown>): void;
}

/**
 * Create a Service Worker fetch event handler that serves @aibind endpoints.
 *
 * Returns a function compatible with `self.addEventListener("fetch", handler)`.
 * Requests to paths outside the aibind prefix are ignored (the SW passes them
 * through to the network as normal).
 */
export function createSWHandler(
  config: StreamHandlerConfig,
): (event: SWFetchEvent) => void {
  const handler = new StreamHandler(config);
  const prefix = config.prefix ?? "/__aibind__";

  return function handleFetch(event: SWFetchEvent): void {
    const url = new URL(event.request.url);

    if (!url.pathname.startsWith(prefix)) return;

    // Track when the stream body is fully consumed to keep the SW alive.
    // Without this, the browser can terminate the SW mid-stream.
    let resolveComplete!: () => void;
    const streamComplete = new Promise<void>((r) => {
      resolveComplete = r;
    });

    event.waitUntil(streamComplete);

    event.respondWith(
      handler
        .handle(event.request)
        .then((response) => {
          if (!response.body) {
            resolveComplete();
            return response;
          }

          // Tee the body: one half goes to the browser, the other tracks completion.
          const [forBrowser, forTracking] = response.body.tee();

          forTracking
            .pipeTo(
              new WritableStream({ close: resolveComplete }),
            )
            .catch(resolveComplete);

          return new Response(forBrowser, {
            status: response.status,
            headers: response.headers,
          });
        })
        .catch((err: unknown) => {
          resolveComplete();
          throw err;
        }),
    );
  };
}
