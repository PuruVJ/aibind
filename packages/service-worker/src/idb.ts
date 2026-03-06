/**
 * Minimal IndexedDB helpers for @aibind/service-worker.
 *
 * All three object stores live in the same database so they share a single
 * connection and stay in sync on version upgrades.
 */

export const STORE_STATUS = "stream_status";
export const STORE_CHUNKS = "stream_chunks";
export const STORE_CONVS = "conversations";

const DB_VERSION = 1;

/**
 * Open (or create) the aibind IndexedDB database.
 *
 * Creates all object stores on first open (onupgradeneeded).
 * Safe to call multiple times — IDB handles concurrent open requests.
 */
export function openAIBindDB(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_STATUS)) {
        db.createObjectStore(STORE_STATUS, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        // Compound key [id, seq] — naturally ordered for range reads
        db.createObjectStore(STORE_CHUNKS, { keyPath: ["id", "seq"] });
      }

      if (!db.objectStoreNames.contains(STORE_CONVS)) {
        db.createObjectStore(STORE_CONVS, { keyPath: "sessionId" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Wrap an IDBRequest in a Promise. */
export function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Run a block inside a readwrite transaction, resolve when complete. */
export function idbTx(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException("Transaction aborted", "AbortError"));
    fn(tx);
  });
}
