/**
 * A single chunk from a durable stream, tagged with a sequence number.
 */
export interface StreamChunk {
  seq: number;
  data: string;
}

/**
 * Current status of a durable stream.
 */
export interface DurableStreamStatus {
  state: "active" | "done" | "stopped" | "error";
  error?: string;
  totalChunks: number;
}

/**
 * Pluggable storage backend for durable streams.
 *
 * Implementations buffer chunks with sequence numbers, allowing clients
 * to reconnect and resume from any position. The default implementation
 * is `MemoryStreamStore` (in-process Map with TTL).
 */
export interface StreamStore {
  /** Create a new stream entry. */
  create(id: string): Promise<void>;

  /** Append a chunk. Returns the assigned sequence number (1-based). */
  append(id: string, chunk: string): Promise<number>;

  /**
   * Yield chunks starting after `afterSeq`.
   * Existing chunks are yielded immediately. If the stream is still active,
   * the generator waits for new chunks until the stream completes/stops/errors.
   */
  readFrom(
    id: string,
    afterSeq: number,
  ): AsyncGenerator<StreamChunk, void, undefined>;

  /** Get the current status of a stream, or null if it doesn't exist. */
  getStatus(id: string): Promise<DurableStreamStatus | null>;

  /** Signal the generation to stop (user-initiated). */
  stop(id: string): Promise<void>;

  /** Mark the stream as successfully completed. */
  complete(id: string): Promise<void>;

  /** Mark the stream as failed with an error message. */
  fail(id: string, error: string): Promise<void>;
}
