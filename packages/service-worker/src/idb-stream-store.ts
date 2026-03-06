/**
 * IndexedDB-backed StreamStore for use inside a Service Worker.
 *
 * Implements the same StreamStore interface as SqliteStreamStore and
 * RedisStreamStore, so it is fully compatible with DurableStream and
 * the existing StreamHandler from @aibind/core.
 *
 * Schema (auto-created on first open):
 *
 * Object store "stream_status" — keyPath: "id"
 *   { id, state, error?, totalChunks, expiresAt }
 *
 * Object store "stream_chunks" — keyPath: ["id", "seq"]
 *   { id, seq, data }
 */

import type { StreamStore, StreamChunk, DurableStreamStatus } from "@aibind/core";
import { openAIBindDB, STORE_STATUS, STORE_CHUNKS, idbReq } from "./idb";

export interface IDBStreamStoreOptions {
  /** IndexedDB database name. Default: "aibind_sw". */
  dbName?: string;
  /** How often readFrom() polls for new chunks (ms). Default: 50. */
  pollIntervalMs?: number;
  /** TTL for completed/stopped/error streams before cleanup (ms). Default: 300_000 (5 min). */
  ttlMs?: number;
}

interface StatusRow {
  id: string;
  state: "active" | "done" | "stopped" | "error";
  error?: string;
  totalChunks: number;
  expiresAt: number;
}

interface ChunkRow {
  id: string;
  seq: number;
  data: string;
}

export class IDBStreamStore implements StreamStore {
  readonly #db: Promise<IDBDatabase>;
  readonly #poll: number;
  readonly #ttl: number;

  constructor(options: IDBStreamStoreOptions = {}) {
    this.#db = openAIBindDB(options.dbName ?? "aibind_sw");
    this.#poll = options.pollIntervalMs ?? 50;
    this.#ttl = options.ttlMs ?? 300_000;
  }

  async create(id: string): Promise<void> {
    const db = await this.#db;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_STATUS, "readwrite");
      const store = tx.objectStore(STORE_STATUS);

      const check = store.get(id);
      check.onsuccess = () => {
        if (check.result) {
          tx.abort();
          reject(new Error(`Stream "${id}" already exists`));
          return;
        }
        const row: StatusRow = {
          id,
          state: "active",
          totalChunks: 0,
          expiresAt: Date.now() + this.#ttl,
        };
        store.put(row);
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error ?? new DOMException("Transaction aborted", "AbortError"));
    });
  }

  async append(id: string, data: string): Promise<number> {
    const db = await this.#db;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_STATUS, STORE_CHUNKS], "readwrite");
      const statusStore = tx.objectStore(STORE_STATUS);
      const chunksStore = tx.objectStore(STORE_CHUNKS);

      const getStatus = statusStore.get(id);
      getStatus.onsuccess = () => {
        const row: StatusRow | undefined = getStatus.result;
        if (!row || row.state !== "active") {
          tx.abort();
          reject(new Error(`Stream "${id}" is not active`));
          return;
        }
        const seq = row.totalChunks + 1;
        statusStore.put({ ...row, totalChunks: seq });
        const putChunk = chunksStore.put({ id, seq, data } satisfies ChunkRow);
        putChunk.onsuccess = () => resolve(seq);
      };

      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error ?? new DOMException("Transaction aborted", "AbortError"));
    });
  }

  async *readFrom(
    id: string,
    afterSeq: number,
  ): AsyncGenerator<StreamChunk, void, undefined> {
    let currentSeq = afterSeq;

    while (true) {
      const db = await this.#db;

      // Read status and new chunks atomically
      const { status, chunks } = await new Promise<{
        status: StatusRow | undefined;
        chunks: ChunkRow[];
      }>((resolve, reject) => {
        const tx = db.transaction([STORE_STATUS, STORE_CHUNKS], "readonly");
        let status: StatusRow | undefined;
        let chunks: ChunkRow[] = [];

        const getStatus = tx.objectStore(STORE_STATUS).get(id);
        getStatus.onsuccess = () => {
          status = getStatus.result;
        };

        const range = IDBKeyRange.bound(
          [id, currentSeq + 1],
          [id, Number.MAX_SAFE_INTEGER],
        );
        const getChunks = tx.objectStore(STORE_CHUNKS).getAll(range);
        getChunks.onsuccess = () => {
          chunks = getChunks.result;
        };

        tx.oncomplete = () => resolve({ status, chunks });
        tx.onerror = () => reject(tx.error);
      });

      for (const chunk of chunks) {
        yield { seq: chunk.seq, data: chunk.data };
        currentSeq = chunk.seq;
      }

      if (status && status.state !== "active") {
        // Final drain: catch chunks written between last read and state change
        const final = await this.#chunksAfter(db, id, currentSeq);
        for (const chunk of final) {
          yield { seq: chunk.seq, data: chunk.data };
        }
        return;
      }

      await new Promise<void>((r) => setTimeout(r, this.#poll));
    }
  }

  async getStatus(id: string): Promise<DurableStreamStatus | null> {
    const db = await this.#db;
    const row = await idbReq<StatusRow | undefined>(
      db.transaction(STORE_STATUS, "readonly").objectStore(STORE_STATUS).get(id),
    );
    if (!row) return null;
    if (row.state !== "active" && row.expiresAt < Date.now()) return null;
    return { state: row.state, error: row.error, totalChunks: row.totalChunks };
  }

  async stop(id: string): Promise<void> {
    return this.#transition(id, "stopped");
  }

  async complete(id: string): Promise<void> {
    return this.#transition(id, "done");
  }

  async fail(id: string, error: string): Promise<void> {
    return this.#transition(id, "error", error);
  }

  /**
   * Remove expired completed/stopped/error streams and their chunks from IndexedDB.
   * Call periodically (e.g., on SW activate or a timer).
   */
  async cleanup(): Promise<void> {
    const db = await this.#db;
    const now = Date.now();

    // Collect expired stream IDs
    const all = await idbReq<StatusRow[]>(
      db.transaction(STORE_STATUS, "readonly").objectStore(STORE_STATUS).getAll(),
    );
    const expired = all
      .filter((r) => r.state !== "active" && r.expiresAt < now)
      .map((r) => r.id);

    if (expired.length === 0) return;

    // Delete status rows
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_STATUS, "readwrite");
      const store = tx.objectStore(STORE_STATUS);
      for (const id of expired) store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Delete chunk rows (one tx per stream to avoid huge range list)
    for (const id of expired) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_CHUNKS, "readwrite");
        const store = tx.objectStore(STORE_CHUNKS);
        store.delete(
          IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]),
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────

  async #chunksAfter(db: IDBDatabase, id: string, afterSeq: number): Promise<ChunkRow[]> {
    const range = IDBKeyRange.bound(
      [id, afterSeq + 1],
      [id, Number.MAX_SAFE_INTEGER],
    );
    return idbReq<ChunkRow[]>(
      db.transaction(STORE_CHUNKS, "readonly").objectStore(STORE_CHUNKS).getAll(range),
    );
  }

  async #transition(
    id: string,
    state: "done" | "stopped" | "error",
    error?: string,
  ): Promise<void> {
    const db = await this.#db;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_STATUS, "readwrite");
      const store = tx.objectStore(STORE_STATUS);

      const get = store.get(id);
      get.onsuccess = () => {
        const row: StatusRow | undefined = get.result;
        if (!row) { resolve(); return; }
        store.put({ ...row, state, ...(error !== undefined ? { error } : {}) });
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
