import {
  ChatHistory,
  type ConversationMessage,
  type ConversationStore,
} from "@aibind/core";

/**
 * Minimal structural type matching the Cloudflare KV namespace binding.
 * Avoids importing `@cloudflare/workers-types` as a hard dependency.
 */
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
};

export interface KVConversationStoreOptions {
  /**
   * Key prefix for all conversation entries.
   * @default "aibind:conv"
   */
  prefix?: string;
  /**
   * TTL in seconds for stored conversations.
   * Maps to KV's `expirationTtl`. Default: 1800 (30 min).
   */
  ttlSec?: number;
}

/**
 * Cloudflare KV-backed ConversationStore for server-side multi-turn history.
 *
 * KV is ideal for conversation storage at the edge: low-latency reads globally,
 * automatic expiry via `expirationTtl`. Each conversation is stored as a
 * serialized `ChatHistory` JSON string under `{prefix}:{sessionId}`.
 *
 * @example
 * ```ts
 * import { KVConversationStore } from "@aibind/cloudflare";
 *
 * export default {
 *   async fetch(request, env) {
 *     const store = new KVConversationStore(env.CONVERSATIONS);
 *     // ...
 *   }
 * }
 * ```
 */
export class KVConversationStore implements ConversationStore {
  readonly #kv: KVNamespace;
  readonly #prefix: string;
  readonly #ttlSec: number;

  constructor(kv: KVNamespace, options?: KVConversationStoreOptions) {
    this.#kv = kv;
    this.#prefix = options?.prefix ?? "aibind:conv";
    this.#ttlSec = options?.ttlSec ?? 1800;
  }

  #key(sessionId: string): string {
    return `${this.#prefix}:${sessionId}`;
  }

  async load(sessionId: string): Promise<ChatHistory<ConversationMessage>> {
    const json = await this.#kv.get(this.#key(sessionId));
    if (!json) return new ChatHistory<ConversationMessage>();
    return ChatHistory.fromJSON<ConversationMessage>(json);
  }

  async save(
    sessionId: string,
    chat: ChatHistory<ConversationMessage>,
  ): Promise<void> {
    await this.#kv.put(this.#key(sessionId), chat.toJSON(), {
      expirationTtl: this.#ttlSec,
    });
  }

  async delete(sessionId: string): Promise<void> {
    await this.#kv.delete(this.#key(sessionId));
  }
}
