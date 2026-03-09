import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { wrapBetterSqlite3 } from "../src/client";
import { SqliteStreamStore } from "../src/sqlite-stream-store";
import { SqliteConversationStore } from "../src/sqlite-conversation-store";
import { ChatHistory } from "@aibind/core";
import type { ConversationMessage } from "@aibind/core";

// ─── Schema helpers ──────────────────────────────────────────────────────────

function createStreamTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS aibind_stream_chunks (
      id   TEXT    NOT NULL,
      seq  INTEGER NOT NULL,
      data TEXT    NOT NULL,
      PRIMARY KEY (id, seq)
    );
    CREATE TABLE IF NOT EXISTS aibind_stream_status (
      id           TEXT    PRIMARY KEY,
      state        TEXT    NOT NULL DEFAULT 'active',
      error        TEXT,
      total_chunks INTEGER NOT NULL DEFAULT 0,
      expires_at   INTEGER NOT NULL
    );
  `);
}

function createConversationTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS aibind_conversations (
      session_id TEXT    PRIMARY KEY,
      data       TEXT    NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);
}

function makeStreamStore(db: Database.Database): SqliteStreamStore {
  return new SqliteStreamStore(wrapBetterSqlite3(db));
}

function makeConversationStore(db: Database.Database): SqliteConversationStore {
  return new SqliteConversationStore(wrapBetterSqlite3(db));
}

// ─── SqliteStreamStore ────────────────────────────────────────────────────────

describe("SqliteStreamStore", () => {
  let db: Database.Database;
  let store: SqliteStreamStore;

  beforeEach(() => {
    db = new Database(":memory:");
    createStreamTables(db);
    store = makeStreamStore(db);
  });

  it("create() inserts an active stream", async () => {
    await store.create("s1");
    const status = await store.getStatus("s1");
    expect(status).not.toBeNull();
    expect(status!.state).toBe("active");
    expect(status!.totalChunks).toBe(0);
  });

  it("create() throws on duplicate ID", async () => {
    await store.create("s1");
    await expect(store.create("s1")).rejects.toThrow("already exists");
  });

  it("append() stores chunks in order and returns correct seq", async () => {
    await store.create("s1");
    const seq1 = await store.append("s1", "hello");
    const seq2 = await store.append("s1", "world");
    expect(seq1).toBe(1);
    expect(seq2).toBe(2);

    const status = await store.getStatus("s1");
    expect(status!.totalChunks).toBe(2);
  });

  it("append() throws when stream is not active", async () => {
    await store.create("s1");
    await store.complete("s1");
    await expect(store.append("s1", "late")).rejects.toThrow("not active");
  });

  it("complete() transitions state to done", async () => {
    await store.create("s1");
    await store.complete("s1");
    expect((await store.getStatus("s1"))!.state).toBe("done");
  });

  it("stop() transitions state to stopped", async () => {
    await store.create("s1");
    await store.stop("s1");
    expect((await store.getStatus("s1"))!.state).toBe("stopped");
  });

  it("fail() transitions state to error with message", async () => {
    await store.create("s1");
    await store.fail("s1", "LLM crashed");
    const status = await store.getStatus("s1");
    expect(status!.state).toBe("error");
    expect(status!.error).toBe("LLM crashed");
  });

  it("getStatus() returns null for unknown stream", async () => {
    expect(await store.getStatus("nope")).toBeNull();
  });

  it("readFrom() yields all chunks for a completed stream", async () => {
    await store.create("s1");
    await store.append("s1", "a");
    await store.append("s1", "b");
    await store.append("s1", "c");
    await store.complete("s1");

    const chunks: string[] = [];
    for await (const chunk of store.readFrom("s1", 0)) {
      chunks.push(chunk.data);
    }
    expect(chunks).toEqual(["a", "b", "c"]);
  });

  it("readFrom() respects afterSeq — skips already-seen chunks", async () => {
    await store.create("s1");
    await store.append("s1", "a");
    await store.append("s1", "b");
    await store.append("s1", "c");
    await store.complete("s1");

    const chunks: string[] = [];
    for await (const chunk of store.readFrom("s1", 1)) {
      chunks.push(chunk.data);
    }
    expect(chunks).toEqual(["b", "c"]);
  });

  it("readFrom() returns nothing for afterSeq past all chunks", async () => {
    await store.create("s1");
    await store.append("s1", "a");
    await store.complete("s1");

    const chunks: string[] = [];
    for await (const chunk of store.readFrom("s1", 5)) {
      chunks.push(chunk.data);
    }
    expect(chunks).toEqual([]);
  });

  it("readFrom() yields chunks for stopped stream", async () => {
    await store.create("s1");
    await store.append("s1", "partial");
    await store.stop("s1");

    const chunks: string[] = [];
    for await (const chunk of store.readFrom("s1", 0)) {
      chunks.push(chunk.data);
    }
    expect(chunks).toEqual(["partial"]);
  });

  it("cleanup() removes expired non-active streams", async () => {
    // Create a store with a very short TTL
    const shortTtlStore = new SqliteStreamStore(wrapBetterSqlite3(db), {
      ttlMs: 1,
    });
    await shortTtlStore.create("expired");
    await shortTtlStore.complete("expired");

    // Wait for TTL to pass
    await new Promise((r) => setTimeout(r, 10));

    await shortTtlStore.cleanup();
    expect(await shortTtlStore.getStatus("expired")).toBeNull();
  });

  it("cleanup() does not remove active streams", async () => {
    const shortTtlStore = new SqliteStreamStore(wrapBetterSqlite3(db), {
      ttlMs: 1,
    });
    await shortTtlStore.create("active");
    await new Promise((r) => setTimeout(r, 10));
    await shortTtlStore.cleanup();

    // Active streams are never expired
    expect(await shortTtlStore.getStatus("active")).not.toBeNull();
  });

  it("custom table names are used for all queries", async () => {
    db.exec(`
      CREATE TABLE my_chunks (
        id TEXT NOT NULL, seq INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (id, seq)
      );
      CREATE TABLE my_status (
        id TEXT PRIMARY KEY, state TEXT NOT NULL DEFAULT 'active',
        error TEXT, total_chunks INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL
      );
    `);

    const customStore = new SqliteStreamStore(wrapBetterSqlite3(db), {
      chunksTable: "my_chunks",
      statusTable: "my_status",
    });

    await customStore.create("s1");
    await customStore.append("s1", "hello");
    await customStore.complete("s1");

    const chunks: string[] = [];
    for await (const chunk of customStore.readFrom("s1", 0)) {
      chunks.push(chunk.data);
    }
    expect(chunks).toEqual(["hello"]);
  });
});

// ─── SqliteConversationStore ──────────────────────────────────────────────────

describe("SqliteConversationStore", () => {
  let db: Database.Database;
  let store: SqliteConversationStore;

  beforeEach(() => {
    db = new Database(":memory:");
    createConversationTable(db);
    store = makeConversationStore(db);
  });

  it("load() returns empty ChatHistory for unknown session", async () => {
    const chat = await store.load("new-session");
    expect(chat.isEmpty).toBe(true);
  });

  it("save() and load() round-trips conversation history", async () => {
    const chat = new ChatHistory<ConversationMessage>();
    chat.append({ role: "user", content: "Hello" });
    chat.append({ role: "assistant", content: "Hi there!" });

    await store.save("s1", chat);

    const loaded = await store.load("s1");
    expect(loaded.messages).toHaveLength(2);
    expect(loaded.messages[0]).toEqual({ role: "user", content: "Hello" });
    expect(loaded.messages[1]).toEqual({
      role: "assistant",
      content: "Hi there!",
    });
  });

  it("save() overwrites existing session on second save", async () => {
    const chat = new ChatHistory<ConversationMessage>();
    chat.append({ role: "user", content: "First" });
    await store.save("s1", chat);

    chat.append({ role: "assistant", content: "Reply" });
    chat.append({ role: "user", content: "Second" });
    await store.save("s1", chat);

    const loaded = await store.load("s1");
    expect(loaded.messages).toHaveLength(3);
  });

  it("delete() removes the session", async () => {
    const chat = new ChatHistory<ConversationMessage>();
    chat.append({ role: "user", content: "hi" });
    await store.save("s1", chat);
    await store.delete("s1");

    const loaded = await store.load("s1");
    expect(loaded.isEmpty).toBe(true);
  });

  it("load() returns empty history for expired session", async () => {
    const shortStore = new SqliteConversationStore(wrapBetterSqlite3(db), {
      ttlMs: 1,
    });

    const chat = new ChatHistory<ConversationMessage>();
    chat.append({ role: "user", content: "hey" });
    await shortStore.save("s1", chat);

    await new Promise((r) => setTimeout(r, 10));

    const loaded = await shortStore.load("s1");
    expect(loaded.isEmpty).toBe(true);
  });

  it("cleanup() removes expired records", async () => {
    const shortStore = new SqliteConversationStore(wrapBetterSqlite3(db), {
      ttlMs: 1,
    });

    const chat = new ChatHistory<ConversationMessage>();
    chat.append({ role: "user", content: "hey" });
    await shortStore.save("s1", chat);
    await new Promise((r) => setTimeout(r, 10));

    await shortStore.cleanup();

    // Row should be gone — load returns empty
    const loaded = await shortStore.load("s1");
    expect(loaded.isEmpty).toBe(true);
  });

  it("preserves branching structure across save/load", async () => {
    const chat = new ChatHistory<ConversationMessage>();
    const m1 = chat.append({ role: "user", content: "Hello" });
    chat.append({ role: "assistant", content: "Hi!" });
    chat.edit(m1, { role: "user", content: "Hey there" });

    await store.save("s1", chat);

    const loaded = await store.load("s1");
    // Active branch should match
    expect(loaded.messages).toEqual(chat.messages);
    expect(loaded.size).toBe(chat.size);
  });

  it("custom table name is used", async () => {
    db.exec(`
      CREATE TABLE my_convs (
        session_id TEXT PRIMARY KEY, data TEXT NOT NULL, expires_at INTEGER NOT NULL
      );
    `);

    const customStore = new SqliteConversationStore(wrapBetterSqlite3(db), {
      table: "my_convs",
    });

    const chat = new ChatHistory<ConversationMessage>();
    chat.append({ role: "user", content: "hi" });
    await customStore.save("s1", chat);

    const loaded = await customStore.load("s1");
    expect(loaded.messages).toHaveLength(1);
  });
});

// ─── wrapBetterSqlite3 ────────────────────────────────────────────────────────

describe("wrapBetterSqlite3", () => {
  it("execute() returns rows for SELECT", async () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (x INTEGER)");
    db.exec("INSERT INTO t VALUES (1), (2), (3)");

    const client = wrapBetterSqlite3(db);
    const result = await client.execute({ sql: "SELECT x FROM t ORDER BY x" });
    expect(result.rows).toEqual([{ x: 1 }, { x: 2 }, { x: 3 }]);
  });

  it("execute() returns empty rows for INSERT/UPDATE", async () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (x INTEGER)");

    const client = wrapBetterSqlite3(db);
    const result = await client.execute({
      sql: "INSERT INTO t VALUES (?)",
      args: [42],
    });
    expect(result.rows).toEqual([]);
  });

  it("batch() runs all statements atomically", async () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (x INTEGER)");

    const client = wrapBetterSqlite3(db);
    await client.batch([
      { sql: "INSERT INTO t VALUES (?)", args: [1] },
      { sql: "INSERT INTO t VALUES (?)", args: [2] },
    ]);

    const result = await client.execute({ sql: "SELECT COUNT(*) as n FROM t" });
    expect(result.rows[0]!.n).toBe(2);
  });

  it("batch() rolls back all statements on error", async () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (x INTEGER PRIMARY KEY)");
    db.exec("INSERT INTO t VALUES (1)");

    const client = wrapBetterSqlite3(db);

    // Second insert will violate UNIQUE constraint
    await expect(
      client.batch([
        { sql: "INSERT INTO t VALUES (?)", args: [2] },
        { sql: "INSERT INTO t VALUES (?)", args: [1] }, // conflict
      ]),
    ).rejects.toThrow();

    // First insert should have been rolled back
    const result = await client.execute({ sql: "SELECT COUNT(*) as n FROM t" });
    expect(result.rows[0]!.n).toBe(1); // only the original row
  });
});
