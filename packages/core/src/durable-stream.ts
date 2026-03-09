import type { StreamStore } from "./stream-store";
import { SSE } from "./sse";

// Storage encoding: "${event}\x01${data}"
// Plain text chunks use event = "" → stored as "\x01{text}"
// Named events use event = "tool_call" etc → stored as "tool_call\x01{data}"
const CHUNK_SEP = "\x01";

export interface DurableStreamOptions {
  store: StreamStore;
  /**
   * Source chunks to pipe through the store.
   * - `event: ""` — plain text chunk streamed as SSE data.
   * - `event: "tool_call"` etc — named SSE event, buffered and replayed on resume.
   */
  source: AsyncIterable<{ event: string; data: string }>;
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
 * Pipes an async iterable source through a store and returns an SSE Response.
 * The store buffers everything so clients can reconnect and resume from where
 * they left off.
 *
 * Each source chunk is `{ event, data }`. Plain text chunks use `event: ""`.
 * Named events (e.g. `tool_call`) use their event name — both are stored and
 * replayed correctly on reconnect.
 *
 * @example
 * ```ts
 * const stream = await DurableStream.create({
 *   store,
 *   source: textSource(streamText({ model, prompt }).textStream),
 * });
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

  // --- Private Helpers ---

  static #encode(event: string, data: string): string {
    return `${event}${CHUNK_SEP}${data}`;
  }

  static #decode(stored: string): { event: string; data: string } {
    const sep = stored.indexOf(CHUNK_SEP);
    if (sep === -1) return { event: "", data: stored }; // legacy plain-text fallback
    return { event: stored.slice(0, sep), data: stored.slice(sep + 1) };
  }

  static async #pipeSource(
    source: AsyncIterable<{ event: string; data: string }>,
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
        await store.append(streamId, DurableStream.#encode(chunk.event, chunk.data));
      }
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
            const { event, data } = DurableStream.#decode(chunk.data);
            if (event) {
              ctrl.enqueue(encoder.encode(SSE.formatEvent(event, data)));
            } else {
              ctrl.enqueue(encoder.encode(SSE.format(chunk.seq, data)));
            }
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
