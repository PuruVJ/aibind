/**
 * IndexedDB-backed ConversationStore for use inside a Service Worker.
 *
 * Stores conversation history per session in the browser's IndexedDB.
 * Uses the same serialization as server-side stores (ChatHistory.toJSON /
 * ChatHistory.fromJSON) so branching structure is fully preserved.
 *
 * Schema (auto-created on first open):
 *
 * Object store "conversations" — keyPath: "sessionId"
 *   { sessionId, data (JSON string), expiresAt }
 */

import type { ConversationStore, ConversationMessage } from "@aibind/core";
import { ChatHistory } from "@aibind/core";
import { openAIBindDB, STORE_CONVS, idbReq } from "./idb";

export interface IDBConversationStoreOptions {
  /** IndexedDB database name. Default: "aibind_sw". */
  dbName?: string;
  /** TTL for idle conversations before cleanup (ms). Default: 1_800_000 (30 min). */
  ttlMs?: number;
}

interface ConvRow {
  sessionId: string;
  data: string;
  expiresAt: number;
}

export class IDBConversationStore implements ConversationStore {
  readonly #db: Promise<IDBDatabase>;
  readonly #ttl: number;

  constructor(options: IDBConversationStoreOptions = {}) {
    this.#db = openAIBindDB(options.dbName ?? "aibind_sw");
    this.#ttl = options.ttlMs ?? 1_800_000;
  }

  async load(sessionId: string): Promise<ChatHistory<ConversationMessage>> {
    const db = await this.#db;
    const row = await idbReq<ConvRow | undefined>(
      db
        .transaction(STORE_CONVS, "readonly")
        .objectStore(STORE_CONVS)
        .get(sessionId),
    );

    if (!row || row.expiresAt < Date.now()) {
      return new ChatHistory<ConversationMessage>();
    }

    return ChatHistory.fromJSON<ConversationMessage>(row.data);
  }

  async save(
    sessionId: string,
    chat: ChatHistory<ConversationMessage>,
  ): Promise<void> {
    const db = await this.#db;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CONVS, "readwrite");
      tx.objectStore(STORE_CONVS).put({
        sessionId,
        data: chat.toJSON(),
        expiresAt: Date.now() + this.#ttl,
      } satisfies ConvRow);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async delete(sessionId: string): Promise<void> {
    const db = await this.#db;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CONVS, "readwrite");
      tx.objectStore(STORE_CONVS).delete(sessionId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Remove expired conversation records from IndexedDB.
   * Call periodically (e.g., on SW activate or a timer).
   */
  async cleanup(): Promise<void> {
    const db = await this.#db;
    const now = Date.now();

    const all = await idbReq<ConvRow[]>(
      db.transaction(STORE_CONVS, "readonly").objectStore(STORE_CONVS).getAll(),
    );
    const expired = all
      .filter((r) => r.expiresAt < now)
      .map((r) => r.sessionId);

    if (expired.length === 0) return;

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_CONVS, "readwrite");
      const store = tx.objectStore(STORE_CONVS);
      for (const key of expired) store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
