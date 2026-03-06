import type {
  StreamStore,
  StreamChunk,
  DurableStreamStatus,
} from "@aibind/core";

/**
 * Minimal Redis client interface — compatible with ioredis, node-redis, upstash, etc.
 * Pass any client that implements these methods.
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, exArg: "EX", ttl: number): Promise<unknown>;
  exists(...keys: string[]): Promise<number>;
  rpush(key: string, ...values: string[]): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  llen(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
}

export interface RedisStreamStoreOptions {
  /** Key prefix. Default: "aibind:stream". */
  prefix?: string;
  /** TTL in seconds. Default: 300 (5 minutes). */
  ttlSec?: number;
  /** How often to poll for new chunks in readFrom(), in ms. Default: 50. */
  pollIntervalMs?: number;
}

/**
 * Redis-backed StreamStore for durable stream resumption.
 *
 * Uses a Redis List per stream for chunk storage, and a separate key
 * for status. Polling-based readFrom() with configurable interval.
 *
 * @example
 * ```ts
 * import { Redis } from "ioredis";
 * import { RedisStreamStore } from "@aibind/redis";
 *
 * const redis = new Redis(process.env.REDIS_URL);
 * const store = new RedisStreamStore(redis);
 *
 * export const handle = createStreamHandler({ models, store, resumable: true });
 * ```
 */
export class RedisStreamStore implements StreamStore {
  readonly #client: RedisClient;
  readonly #prefix: string;
  readonly #ttlSec: number;
  readonly #pollIntervalMs: number;

  constructor(client: RedisClient, options?: RedisStreamStoreOptions) {
    this.#client = client;
    this.#prefix = options?.prefix ?? "aibind:stream";
    this.#ttlSec = options?.ttlSec ?? 300;
    this.#pollIntervalMs = options?.pollIntervalMs ?? 50;
  }

  #key(id: string, suffix: string): string {
    return `${this.#prefix}:${id}:${suffix}`;
  }

  async create(id: string): Promise<void> {
    const statusKey = this.#key(id, "status");
    const existing = await this.#client.exists(statusKey);
    if (existing) throw new Error(`Stream "${id}" already exists`);
    const status: DurableStreamStatus = { state: "active", totalChunks: 0 };
    await this.#client.set(statusKey, JSON.stringify(status), "EX", this.#ttlSec);
  }

  async append(id: string, chunk: string): Promise<number> {
    const chunksKey = this.#key(id, "chunks");
    const statusKey = this.#key(id, "status");

    const seq = await this.#client.rpush(chunksKey, chunk);
    await this.#client.expire(chunksKey, this.#ttlSec);

    const statusJson = await this.#client.get(statusKey);
    if (statusJson) {
      const status = JSON.parse(statusJson) as DurableStreamStatus;
      status.totalChunks = seq;
      await this.#client.set(statusKey, JSON.stringify(status), "EX", this.#ttlSec);
    }

    return seq;
  }

  async *readFrom(
    id: string,
    afterSeq: number,
  ): AsyncGenerator<StreamChunk, void, undefined> {
    const chunksKey = this.#key(id, "chunks");
    let cursor = afterSeq;

    // Yield already-stored chunks
    const existing = await this.#client.lrange(chunksKey, afterSeq, -1);
    for (const data of existing) {
      cursor++;
      yield { seq: cursor, data };
    }

    // Poll for new chunks until stream is terminal
    while (true) {
      const status = await this.getStatus(id);
      if (!status || status.state !== "active") {
        // Drain any final chunks written before/during status transition
        const remaining = await this.#client.lrange(chunksKey, cursor, -1);
        for (const data of remaining) {
          cursor++;
          yield { seq: cursor, data };
        }
        return;
      }

      const len = await this.#client.llen(chunksKey);
      if (len > cursor) {
        const newChunks = await this.#client.lrange(chunksKey, cursor, -1);
        for (const data of newChunks) {
          cursor++;
          yield { seq: cursor, data };
        }
      } else {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, this.#pollIntervalMs),
        );
      }
    }
  }

  async getStatus(id: string): Promise<DurableStreamStatus | null> {
    const json = await this.#client.get(this.#key(id, "status"));
    return json ? (JSON.parse(json) as DurableStreamStatus) : null;
  }

  async stop(id: string): Promise<void> {
    await this.#setTerminal(id, "stopped");
  }

  async complete(id: string): Promise<void> {
    await this.#setTerminal(id, "done");
  }

  async fail(id: string, error: string): Promise<void> {
    await this.#setTerminal(id, "error", error);
  }

  async #setTerminal(
    id: string,
    state: DurableStreamStatus["state"],
    error?: string,
  ): Promise<void> {
    const statusKey = this.#key(id, "status");
    const statusJson = await this.#client.get(statusKey);
    if (!statusJson) return;
    const status = JSON.parse(statusJson) as DurableStreamStatus;
    if (status.state !== "active") return;
    status.state = state;
    if (error) status.error = error;
    await this.#client.set(statusKey, JSON.stringify(status), "EX", this.#ttlSec);
  }
}
