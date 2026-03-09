import {
  ChatHistory,
  type ConversationMessage,
  type ConversationStore,
} from "@aibind/core";
import type { RedisClient } from "./redis-stream-store";

export interface RedisConversationStoreOptions {
  /** Key prefix. Default: "aibind:conv". */
  prefix?: string;
  /** TTL in seconds. Default: 1800 (30 minutes). */
  ttlSec?: number;
}

/**
 * Redis-backed ConversationStore for server-side multi-turn history.
 *
 * Stores serialized ChatHistory JSON strings in Redis with TTL.
 * Uses the same RedisClient interface as RedisStreamStore — share one connection.
 *
 * @example
 * ```ts
 * import { Redis } from "ioredis";
 * import { RedisConversationStore } from "@aibind/redis";
 *
 * const redis = new Redis(process.env.REDIS_URL);
 * const store = new RedisConversationStore(redis);
 *
 * export const handle = createStreamHandler({
 *   models,
 *   conversation: { store },
 * });
 * ```
 */
export class RedisConversationStore implements ConversationStore {
  readonly #client: RedisClient;
  readonly #prefix: string;
  readonly #ttlSec: number;

  constructor(client: RedisClient, options?: RedisConversationStoreOptions) {
    this.#client = client;
    this.#prefix = options?.prefix ?? "aibind:conv";
    this.#ttlSec = options?.ttlSec ?? 1800;
  }

  #key(sessionId: string): string {
    return `${this.#prefix}:${sessionId}`;
  }

  async load(sessionId: string): Promise<ChatHistory<ConversationMessage>> {
    const json = await this.#client.get(this.#key(sessionId));
    if (!json) return new ChatHistory<ConversationMessage>();
    return ChatHistory.fromJSON<ConversationMessage>(json);
  }

  async save(
    sessionId: string,
    chat: ChatHistory<ConversationMessage>,
  ): Promise<void> {
    await this.#client.set(
      this.#key(sessionId),
      chat.toJSON(),
      "EX",
      this.#ttlSec,
    );
  }

  async delete(sessionId: string): Promise<void> {
    await this.#client.del(this.#key(sessionId));
  }
}
