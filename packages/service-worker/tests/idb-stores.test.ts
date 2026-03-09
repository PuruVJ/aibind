import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { IDBStreamStore } from "../src/idb-stream-store";
import { IDBConversationStore } from "../src/idb-conversation-store";
import { ChatHistory } from "@aibind/core";
import type { ConversationMessage } from "@aibind/core";

/** Each test gets its own isolated database. */
function freshDb(): string {
  return `test_${Math.random().toString(36).slice(2)}`;
}

// ─── IDBStreamStore ───────────────────────────────────────────────────────────

describe("IDBStreamStore", () => {
  let store: IDBStreamStore;
  let dbName: string;

  beforeEach(() => {
    dbName = freshDb();
    store = new IDBStreamStore({ dbName });
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
    await store.fail("s1", "model crashed");
    const status = await store.getStatus("s1");
    expect(status!.state).toBe("error");
    expect(status!.error).toBe("model crashed");
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

  it("readFrom() yields chunks for errored stream", async () => {
    await store.create("s1");
    await store.append("s1", "before-crash");
    await store.fail("s1", "timeout");

    const chunks: string[] = [];
    for await (const chunk of store.readFrom("s1", 0)) {
      chunks.push(chunk.data);
    }
    expect(chunks).toEqual(["before-crash"]);
  });

  it("readFrom() streams chunks that arrive after iteration starts", async () => {
    await store.create("s1");

    const collected: string[] = [];
    const readPromise = (async () => {
      for await (const chunk of store.readFrom("s1", 0)) {
        collected.push(chunk.data);
      }
    })();

    // Let the reader start polling
    await new Promise((r) => setTimeout(r, 20));

    await store.append("s1", "live-1");
    await store.append("s1", "live-2");
    await store.complete("s1");

    await readPromise;
    expect(collected).toEqual(["live-1", "live-2"]);
  });

  it("cleanup() removes expired non-active streams and their chunks", async () => {
    const shortStore = new IDBStreamStore({ dbName, ttlMs: 1 });
    await shortStore.create("expired");
    await shortStore.append("expired", "data");
    await shortStore.complete("expired");

    await new Promise((r) => setTimeout(r, 10));
    await shortStore.cleanup();

    expect(await shortStore.getStatus("expired")).toBeNull();
  });

  it("cleanup() does not remove active streams", async () => {
    const shortStore = new IDBStreamStore({ dbName, ttlMs: 1 });
    await shortStore.create("active");

    await new Promise((r) => setTimeout(r, 10));
    await shortStore.cleanup();

    expect(await shortStore.getStatus("active")).not.toBeNull();
  });

  it("two streams are fully independent", async () => {
    await store.create("a");
    await store.create("b");

    await store.append("a", "hello");
    await store.append("b", "world");
    await store.append("a", "foo");

    await store.complete("a");
    await store.complete("b");

    const chunksA: string[] = [];
    for await (const c of store.readFrom("a", 0)) chunksA.push(c.data);

    const chunksB: string[] = [];
    for await (const c of store.readFrom("b", 0)) chunksB.push(c.data);

    expect(chunksA).toEqual(["hello", "foo"]);
    expect(chunksB).toEqual(["world"]);
  });

  it("getStatus() hides expired done streams without cleanup()", async () => {
    const shortStore = new IDBStreamStore({ dbName, ttlMs: 1 });
    await shortStore.create("s1");
    await shortStore.complete("s1");

    await new Promise((r) => setTimeout(r, 10));

    expect(await shortStore.getStatus("s1")).toBeNull();
  });
});

// ─── IDBConversationStore ─────────────────────────────────────────────────────

describe("IDBConversationStore", () => {
  let store: IDBConversationStore;

  beforeEach(() => {
    store = new IDBConversationStore({ dbName: freshDb() });
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

  it("delete() on unknown session is a no-op", async () => {
    await expect(store.delete("never-saved")).resolves.not.toThrow();
  });

  it("load() returns empty history for expired session", async () => {
    const shortStore = new IDBConversationStore({
      dbName: freshDb(),
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
    const dbName = freshDb();
    const shortStore = new IDBConversationStore({ dbName, ttlMs: 1 });
    const chat = new ChatHistory<ConversationMessage>();
    chat.append({ role: "user", content: "hey" });
    await shortStore.save("s1", chat);

    await new Promise((r) => setTimeout(r, 10));
    await shortStore.cleanup();

    const loaded = await shortStore.load("s1");
    expect(loaded.isEmpty).toBe(true);
  });

  it("cleanup() leaves non-expired sessions intact", async () => {
    const chat = new ChatHistory<ConversationMessage>();
    chat.append({ role: "user", content: "hi" });
    await store.save("s1", chat);

    await store.cleanup();

    const loaded = await store.load("s1");
    expect(loaded.isEmpty).toBe(false);
  });

  it("preserves branching structure across save/load", async () => {
    const chat = new ChatHistory<ConversationMessage>();
    const m1 = chat.append({ role: "user", content: "Hello" });
    chat.append({ role: "assistant", content: "Hi!" });
    chat.edit(m1, { role: "user", content: "Hey there" });

    await store.save("s1", chat);

    const loaded = await store.load("s1");
    expect(loaded.messages).toEqual(chat.messages);
    expect(loaded.size).toBe(chat.size);
  });

  it("multiple sessions are isolated from each other", async () => {
    const chatA = new ChatHistory<ConversationMessage>();
    chatA.append({ role: "user", content: "Session A" });
    await store.save("a", chatA);

    const chatB = new ChatHistory<ConversationMessage>();
    chatB.append({ role: "user", content: "Session B" });
    chatB.append({ role: "assistant", content: "Hello from B" });
    await store.save("b", chatB);

    const loadedA = await store.load("a");
    const loadedB = await store.load("b");

    expect(loadedA.messages).toHaveLength(1);
    expect(loadedA.messages[0].content).toBe("Session A");
    expect(loadedB.messages).toHaveLength(2);
  });
});

// ─── Shared DB — StreamStore and ConversationStore coexist ────────────────────

describe("IDBStreamStore + IDBConversationStore sharing a DB", () => {
  it("stores coexist without interfering", async () => {
    const dbName = freshDb();
    const streamStore = new IDBStreamStore({ dbName });
    const convStore = new IDBConversationStore({ dbName });

    await streamStore.create("stream-1");
    await streamStore.append("stream-1", "chunk");
    await streamStore.complete("stream-1");

    const chat = new ChatHistory<ConversationMessage>();
    chat.append({ role: "user", content: "hello" });
    await convStore.save("session-1", chat);

    const chunks: string[] = [];
    for await (const c of streamStore.readFrom("stream-1", 0)) {
      chunks.push(c.data);
    }
    expect(chunks).toEqual(["chunk"]);

    const loaded = await convStore.load("session-1");
    expect(loaded.messages[0].content).toBe("hello");
  });
});
