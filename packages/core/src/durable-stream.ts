import type { StreamStore } from "./stream-store";
import { formatSSE, formatSSEEvent } from "./sse";

export interface DurableStreamOptions {
  store: StreamStore;
  /**
   * An async iterable of string chunks (e.g. from AI SDK's `streamText().textStream`).
   * The durable stream will pipe these chunks through the store.
   */
  source: AsyncIterable<string>;
  /**
   * Optional AbortSignal. When the stop endpoint fires, this signal is aborted
   * to terminate the LLM generation.
   */
  signal?: AbortSignal;
}

export interface DurableStreamResult {
  streamId: string;
  /** SSE streaming response ready to send to the client. */
  response: Response;
  /**
   * AbortController for the generation. Call `.abort()` to stop the LLM.
   * The handler's stop endpoint calls this.
   */
  controller: AbortController;
}

/**
 * Create a durable (resumable) stream.
 *
 * Pipes an async iterable source (typically `streamText().textStream`) through
 * a StreamStore, and returns an SSE Response that delivers chunks to the client.
 * The store buffers everything, so clients can reconnect and resume.
 */
export async function createDurableStream(
  options: DurableStreamOptions,
): Promise<DurableStreamResult> {
  const { store, source } = options;
  const streamId = crypto.randomUUID();
  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;

  await store.create(streamId);

  // Start piping source → store in the background
  pipeSourceToStore(source, store, streamId, signal).catch(() => {
    // Errors are captured via store.fail() inside pipeSourceToStore
  });

  // Build the SSE response that reads from the store
  const response = buildSSEResponse(store, streamId, 0, true);

  return { streamId, response, controller };
}

/**
 * Create an SSE response that resumes a stream from a given sequence number.
 */
export function createResumeResponse(options: {
  store: StreamStore;
  streamId: string;
  afterSeq: number;
}): Response {
  return buildSSEResponse(
    options.store,
    options.streamId,
    options.afterSeq,
    false,
  );
}

/** Pipe source chunks into the store. Marks complete/stopped/failed on exit. */
async function pipeSourceToStore(
  source: AsyncIterable<string>,
  store: StreamStore,
  streamId: string,
  signal: AbortSignal,
): Promise<void> {
  try {
    for await (const chunk of source) {
      if (signal.aborted) {
        await store.stop(streamId);
        return;
      }
      await store.append(streamId, chunk);
    }
    // Check if stopped during final iteration
    const status = await store.getStatus(streamId);
    if (status?.state === "active") {
      await store.complete(streamId);
    }
  } catch (err) {
    // Abort errors → stopped
    if (err instanceof DOMException && err.name === "AbortError") {
      await store.stop(streamId);
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    await store.fail(streamId, message);
  }
}

/** Build an SSE Response that streams chunks from the store. */
function buildSSEResponse(
  store: StreamStore,
  streamId: string,
  afterSeq: number,
  sendStreamId: boolean,
): Response {
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(ctrl) {
      // Send stream ID as first event (only on initial, not resume)
      if (sendStreamId) {
        ctrl.enqueue(
          encoder.encode(formatSSE(streamId, streamId, "stream-id")),
        );
      }

      try {
        for await (const chunk of store.readFrom(streamId, afterSeq)) {
          ctrl.enqueue(encoder.encode(formatSSE(chunk.seq, chunk.data)));
        }

        // Stream ended — send terminal event
        const status = await store.getStatus(streamId);
        if (status?.state === "error") {
          ctrl.enqueue(
            encoder.encode(
              formatSSEEvent("error", status.error ?? "Unknown error"),
            ),
          );
        } else if (status?.state === "stopped") {
          ctrl.enqueue(encoder.encode(formatSSEEvent("stopped")));
        }
        ctrl.enqueue(encoder.encode(formatSSEEvent("done")));
        ctrl.close();
      } catch {
        ctrl.enqueue(
          encoder.encode(formatSSEEvent("error", "Stream read failed")),
        );
        ctrl.enqueue(encoder.encode(formatSSEEvent("done")));
        ctrl.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Stream-Id": streamId,
    },
  });
}
