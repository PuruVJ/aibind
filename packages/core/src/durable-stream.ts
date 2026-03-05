import type { StreamStore } from "./stream-store";
import { SSE } from "./sse";

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

export interface ResumeOptions {
  store: StreamStore;
  streamId: string;
  afterSeq: number;
}

/**
 * A resumable server-sent event stream backed by a {@link StreamStore}.
 *
 * Pipes an async iterable source (typically `streamText().textStream`) through
 * a store, and returns an SSE Response that delivers chunks to the client.
 * The store buffers everything so clients can reconnect and resume from where
 * they left off.
 *
 * @example
 * ```ts
 * const stream = await DurableStream.create({
 *   store,
 *   source: streamText({ model, prompt }).textStream,
 * });
 *
 * // Send the SSE response to the client
 * return stream.response;
 *
 * // Later, to stop generation:
 * stream.stop();
 *
 * // Client reconnects — resume from seq 42:
 * return DurableStream.resume({ store, streamId: id, afterSeq: 42 });
 * ```
 */
export class DurableStream {
  /** Unique identifier for this stream. */
  readonly id: string;

  /** SSE streaming response ready to send to the client. */
  readonly response: Response;

  /** AbortController for the generation. */
  private readonly controller: AbortController;

  private constructor(
    id: string,
    response: Response,
    controller: AbortController,
  ) {
    this.id = id;
    this.response = response;
    this.controller = controller;
  }

  /**
   * Create a new durable stream.
   *
   * Starts piping the source into the store in the background and returns
   * an SSE response immediately.
   */
  static async create(options: DurableStreamOptions): Promise<DurableStream> {
    const { store, source } = options;
    const streamId = crypto.randomUUID();
    const controller = new AbortController();
    const signal = options.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;

    await store.create(streamId);

    // Start piping source → store in the background
    DurableStream.#pipeSource(source, store, streamId, signal).catch(() => {
      // Errors are captured via store.fail() inside #pipeSource
    });

    const response = DurableStream.#buildSSEResponse(store, streamId, 0, true);

    return new DurableStream(streamId, response, controller);
  }

  /**
   * Create an SSE response that resumes a stream from a given sequence number.
   */
  static resume(options: ResumeOptions): Response {
    return DurableStream.#buildSSEResponse(
      options.store,
      options.streamId,
      options.afterSeq,
      false,
    );
  }

  /** Abort the underlying LLM generation. */
  stop(): void {
    this.controller.abort();
  }

  // ─── Private Helpers ────────────────────────────────────────

  /** Pipe source chunks into the store. Marks complete/stopped/failed on exit. */
  static async #pipeSource(
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
      if (err instanceof DOMException && err.name === "AbortError") {
        await store.stop(streamId);
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      await store.fail(streamId, message);
    }
  }

  /** Build an SSE Response that streams chunks from the store. */
  static #buildSSEResponse(
    store: StreamStore,
    streamId: string,
    afterSeq: number,
    sendStreamId: boolean,
  ): Response {
    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(ctrl) {
        if (sendStreamId) {
          ctrl.enqueue(
            encoder.encode(SSE.format(streamId, streamId, "stream-id")),
          );
        }

        try {
          for await (const chunk of store.readFrom(streamId, afterSeq)) {
            ctrl.enqueue(encoder.encode(SSE.format(chunk.seq, chunk.data)));
          }

          const status = await store.getStatus(streamId);
          if (status?.state === "error") {
            ctrl.enqueue(
              encoder.encode(
                SSE.formatEvent("error", status.error ?? "Unknown error"),
              ),
            );
          } else if (status?.state === "stopped") {
            ctrl.enqueue(encoder.encode(SSE.formatEvent("stopped")));
          }
          ctrl.enqueue(encoder.encode(SSE.formatEvent("done")));
          ctrl.close();
        } catch {
          ctrl.enqueue(
            encoder.encode(SSE.formatEvent("error", "Stream read failed")),
          );
          ctrl.enqueue(encoder.encode(SSE.formatEvent("done")));
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
}
