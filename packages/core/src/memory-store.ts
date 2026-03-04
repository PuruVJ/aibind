import type { StreamChunk, StreamStatus, StreamStore } from "./stream-store";

interface StreamEntry {
  chunks: StreamChunk[];
  status: StreamStatus;
  /** Resolvers waiting for the next chunk (subscriber pattern). */
  waiters: Array<() => void>;
  /** TTL cleanup timer. */
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * In-memory StreamStore implementation.
 *
 * Uses a Map with subscriber queues for real-time `readFrom()` — no polling.
 * Each stream auto-cleans after `ttlMs` (default 5 minutes).
 */
export class MemoryStreamStore implements StreamStore {
  #streams = new Map<string, StreamEntry>();
  #ttlMs: number;

  constructor(options?: { ttlMs?: number }) {
    this.#ttlMs = options?.ttlMs ?? 5 * 60 * 1000;
  }

  async create(id: string): Promise<void> {
    if (this.#streams.has(id)) {
      throw new Error(`Stream "${id}" already exists`);
    }
    this.#streams.set(id, {
      chunks: [],
      status: { state: "active", totalChunks: 0 },
      waiters: [],
      timer: null,
    });
  }

  async append(id: string, chunk: string): Promise<number> {
    const entry = this.#getEntry(id);
    if (entry.status.state !== "active") {
      throw new Error(
        `Cannot append to stream "${id}" in state "${entry.status.state}"`,
      );
    }
    const seq = entry.chunks.length + 1;
    entry.chunks.push({ seq, data: chunk });
    entry.status.totalChunks = entry.chunks.length;
    // Wake all waiters
    const waiters = entry.waiters.splice(0);
    for (const resolve of waiters) resolve();
    return seq;
  }

  async *readFrom(
    id: string,
    afterSeq: number,
  ): AsyncGenerator<StreamChunk, void, undefined> {
    const entry = this.#getEntry(id);
    let cursor = afterSeq;

    while (true) {
      // Yield any buffered chunks past the cursor
      while (cursor < entry.chunks.length) {
        yield entry.chunks[cursor]!;
        cursor++;
      }

      // If stream is terminal, we're done
      if (entry.status.state !== "active") {
        return;
      }

      // Wait for the next chunk or state change
      await new Promise<void>((resolve) => {
        entry.waiters.push(resolve);
      });
    }
  }

  async getStatus(id: string): Promise<StreamStatus | null> {
    const entry = this.#streams.get(id);
    return entry ? { ...entry.status } : null;
  }

  async stop(id: string): Promise<void> {
    const entry = this.#getEntry(id);
    if (entry.status.state !== "active") return;
    entry.status.state = "stopped";
    this.#wakeAndScheduleCleanup(entry, id);
  }

  async complete(id: string): Promise<void> {
    const entry = this.#getEntry(id);
    if (entry.status.state !== "active") return;
    entry.status.state = "done";
    this.#wakeAndScheduleCleanup(entry, id);
  }

  async fail(id: string, error: string): Promise<void> {
    const entry = this.#getEntry(id);
    if (entry.status.state !== "active") return;
    entry.status.state = "error";
    entry.status.error = error;
    this.#wakeAndScheduleCleanup(entry, id);
  }

  /** Visible for testing — number of active streams. */
  get size(): number {
    return this.#streams.size;
  }

  /** Visible for testing — force immediate cleanup. */
  cleanup(id: string): void {
    const entry = this.#streams.get(id);
    if (entry?.timer) clearTimeout(entry.timer);
    this.#streams.delete(id);
  }

  #getEntry(id: string): StreamEntry {
    const entry = this.#streams.get(id);
    if (!entry) throw new Error(`Stream "${id}" not found`);
    return entry;
  }

  #wakeAndScheduleCleanup(entry: StreamEntry, id: string): void {
    // Wake all waiters so readFrom() can see the terminal state
    const waiters = entry.waiters.splice(0);
    for (const resolve of waiters) resolve();
    // Schedule TTL cleanup
    entry.timer = setTimeout(() => this.#streams.delete(id), this.#ttlMs);
  }
}
