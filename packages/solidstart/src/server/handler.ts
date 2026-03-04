import { streamText, Output, jsonSchema } from "ai";
import type { StreamStore } from "@aibind/core";
import {
  MemoryStreamStore,
  createDurableStream,
  createResumeResponse,
} from "@aibind/core";

type LanguageModel = string | import("ai").LanguageModel;

interface StreamHandlerConfig {
  /** Single model for all requests. */
  model?: LanguageModel;
  /** Named models — client selects via `model` key in request body. */
  models?: Record<string, LanguageModel>;
  /** Route prefix for the streaming endpoints. Default: '/__aibind__' */
  prefix?: string;
  /**
   * Enable resumable streams. When true, streams are buffered server-side
   * and clients can reconnect + resume from where they left off.
   */
  resumable?: boolean;
  /**
   * Custom StreamStore for resumable streams. Defaults to MemoryStreamStore.
   * Only used when `resumable: true`.
   */
  store?: StreamStore;
}

// Map of active stream controllers (for stop endpoint)
const activeStreams = new Map<string, AbortController>();

/**
 * Generic Web Request/Response handler for streaming endpoints.
 * Works with SolidStart API routes and any framework using Web standard Request/Response.
 *
 * @example
 * ```ts
 * // src/routes/__aibind__/[...path].ts
 * import { createStreamHandler } from '@aibind/solidstart/server';
 *
 * const handler = createStreamHandler({ model: myModel });
 *
 * export async function POST({ request }) {
 *   return handler(request);
 * }
 * ```
 */
export function createStreamHandler(
  config: StreamHandlerConfig,
): (request: Request) => Promise<Response> {
  const prefix = config.prefix ?? "/__aibind__";
  const resumable = config.resumable ?? false;
  const store = resumable ? (config.store ?? new MemoryStreamStore()) : null;

  function resolveModel(requested?: string): import("ai").LanguageModel {
    if (config.models) {
      const key = requested ?? Object.keys(config.models)[0];
      const model = config.models[key];
      if (!model) {
        throw new Error(`Unknown model key: "${key}"`);
      }
      return model as import("ai").LanguageModel;
    }
    if (!config.model) {
      throw new Error("No model configured — provide `model` or `models`");
    }
    return config.model as import("ai").LanguageModel;
  }

  function handleStream(
    body: Record<string, unknown>,
    structured: boolean,
  ): Response | Promise<Response> {
    const { prompt, system, model: requestedModel, schema } = body;
    if (typeof prompt !== "string" || !prompt.trim()) {
      return Response.json({ error: "prompt is required" }, { status: 400 });
    }

    let model: import("ai").LanguageModel;
    try {
      model = resolveModel(requestedModel as string | undefined);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return Response.json({ error: message }, { status: 400 });
    }

    const output = structured
      ? schema
        ? Output.object({ schema: jsonSchema(schema as never) })
        : Output.json()
      : undefined;

    const result = streamText({
      model,
      prompt,
      system: system as string | undefined,
      ...(output && { output }),
    });

    if (!resumable || !store) {
      return result.toTextStreamResponse();
    }

    return handleDurableStream(result.textStream);
  }

  async function handleDurableStream(
    source: AsyncIterable<string>,
  ): Promise<Response> {
    const { streamId, response, controller } = await createDurableStream({
      store: store!,
      source,
    });
    activeStreams.set(streamId, controller);
    return response;
  }

  function handleResume(url: URL): Response {
    if (!store) {
      return Response.json(
        { error: "Resumable streams not enabled" },
        { status: 400 },
      );
    }

    const streamId = url.searchParams.get("id");
    const afterSeq = parseInt(url.searchParams.get("after") ?? "0", 10);

    if (!streamId) {
      return Response.json(
        { error: "id parameter is required" },
        { status: 400 },
      );
    }

    return createResumeResponse({ store, streamId, afterSeq });
  }

  async function handleStop(body: Record<string, unknown>): Promise<Response> {
    const { id } = body;
    if (typeof id !== "string") {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const controller = activeStreams.get(id);
    if (controller) {
      controller.abort();
      activeStreams.delete(id);
    }

    if (store) {
      try {
        await store.stop(id);
      } catch {
        // Stream may already be stopped/completed
      }
    }

    return Response.json({ ok: true });
  }

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === "POST") {
      if (pathname === `${prefix}/stream`) {
        return handleStream(await request.json(), false);
      }
      if (pathname === `${prefix}/structured`) {
        return handleStream(await request.json(), true);
      }
      if (resumable && pathname === `${prefix}/stream/stop`) {
        return handleStop(await request.json());
      }
    }

    if (request.method === "GET") {
      if (resumable && pathname === `${prefix}/stream/resume`) {
        return handleResume(url);
      }
    }

    return new Response("Not Found", { status: 404 });
  };
}
