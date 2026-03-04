import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryStreamStore } from "../src/memory-store";

describe("MemoryStreamStore", () => {
  let store: MemoryStreamStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new MemoryStreamStore({ ttlMs: 1000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- create ---

  it("creates a stream", async () => {
    await store.create("s1");
    const status = await store.getStatus("s1");
    expect(status).toEqual({ state: "active", totalChunks: 0 });
  });

  it("throws on duplicate create", async () => {
    await store.create("s1");
    await expect(store.create("s1")).rejects.toThrow("already exists");
  });

  // --- append ---

  it("appends chunks with sequential seq numbers", async () => {
    await store.create("s1");
    expect(await store.append("s1", "hello")).toBe(1);
    expect(await store.append("s1", " world")).toBe(2);
    const status = await store.getStatus("s1");
    expect(status!.totalChunks).toBe(2);
  });

  it("throws when appending to non-existent stream", async () => {
    await expect(store.append("nope", "x")).rejects.toThrow("not found");
  });

  it("throws when appending to completed stream", async () => {
    await store.create("s1");
    await store.complete("s1");
    await expect(store.append("s1", "x")).rejects.toThrow("Cannot append");
  });

  it("throws when appending to stopped stream", async () => {
    await store.create("s1");
    await store.stop("s1");
    await expect(store.append("s1", "x")).rejects.toThrow("Cannot append");
  });

  // --- readFrom ---

  it("reads all chunks from seq 0", async () => {
    await store.create("s1");
    await store.append("s1", "a");
    await store.append("s1", "b");
    await store.append("s1", "c");
    await store.complete("s1");

    const chunks = [];
    for await (const chunk of store.readFrom("s1", 0)) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual([
      { seq: 1, data: "a" },
      { seq: 2, data: "b" },
      { seq: 3, data: "c" },
    ]);
  });

  it("resumes from a given seq", async () => {
    await store.create("s1");
    await store.append("s1", "a");
    await store.append("s1", "b");
    await store.append("s1", "c");
    await store.complete("s1");

    const chunks = [];
    for await (const chunk of store.readFrom("s1", 2)) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual([{ seq: 3, data: "c" }]);
  });

  it("waits for new chunks on active stream", async () => {
    await store.create("s1");
    await store.append("s1", "a");

    const chunks: Array<{ seq: number; data: string }> = [];
    const readPromise = (async () => {
      for await (const chunk of store.readFrom("s1", 0)) {
        chunks.push(chunk);
      }
    })();

    // Let the reader consume "a" and start waiting
    await vi.advanceTimersByTimeAsync(0);
    expect(chunks).toEqual([{ seq: 1, data: "a" }]);

    // Append more
    await store.append("s1", "b");
    await vi.advanceTimersByTimeAsync(0);
    expect(chunks).toEqual([
      { seq: 1, data: "a" },
      { seq: 2, data: "b" },
    ]);

    // Complete to end the reader
    await store.complete("s1");
    await readPromise;
    expect(chunks.length).toBe(2);
  });

  it("stops waiting when stream is stopped", async () => {
    await store.create("s1");
    const chunks: Array<{ seq: number; data: string }> = [];
    const readPromise = (async () => {
      for await (const chunk of store.readFrom("s1", 0)) {
        chunks.push(chunk);
      }
    })();

    await store.append("s1", "a");
    await vi.advanceTimersByTimeAsync(0);

    await store.stop("s1");
    await readPromise;
    expect(chunks).toEqual([{ seq: 1, data: "a" }]);
  });

  it("stops waiting when stream errors", async () => {
    await store.create("s1");
    const chunks: Array<{ seq: number; data: string }> = [];
    const readPromise = (async () => {
      for await (const chunk of store.readFrom("s1", 0)) {
        chunks.push(chunk);
      }
    })();

    await store.append("s1", "x");
    await vi.advanceTimersByTimeAsync(0);

    await store.fail("s1", "rate limited");
    await readPromise;
    expect(chunks).toEqual([{ seq: 1, data: "x" }]);

    const status = await store.getStatus("s1");
    expect(status!.state).toBe("error");
    expect(status!.error).toBe("rate limited");
  });

  it("returns empty for readFrom past all chunks on completed stream", async () => {
    await store.create("s1");
    await store.append("s1", "a");
    await store.complete("s1");

    const chunks = [];
    for await (const chunk of store.readFrom("s1", 5)) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual([]);
  });

  // --- getStatus ---

  it("returns null for non-existent stream", async () => {
    expect(await store.getStatus("nope")).toBeNull();
  });

  // --- stop / complete / fail ---

  it("stop is idempotent on non-active stream", async () => {
    await store.create("s1");
    await store.complete("s1");
    await store.stop("s1"); // should not throw
    expect((await store.getStatus("s1"))!.state).toBe("done");
  });

  it("complete is idempotent on non-active stream", async () => {
    await store.create("s1");
    await store.stop("s1");
    await store.complete("s1"); // should not throw
    expect((await store.getStatus("s1"))!.state).toBe("stopped");
  });

  // --- TTL cleanup ---

  it("cleans up after TTL expires", async () => {
    await store.create("s1");
    await store.complete("s1");
    expect(store.size).toBe(1);

    vi.advanceTimersByTime(1001);
    expect(store.size).toBe(0);
    expect(await store.getStatus("s1")).toBeNull();
  });

  it("does not clean up active streams", async () => {
    await store.create("s1");
    vi.advanceTimersByTime(5000);
    // Still active — no TTL timer was set
    expect(store.size).toBe(1);
  });

  // --- cleanup ---

  it("force cleanup removes stream immediately", async () => {
    await store.create("s1");
    await store.append("s1", "a");
    store.cleanup("s1");
    expect(store.size).toBe(0);
  });

  // --- size ---

  it("tracks multiple concurrent streams", async () => {
    await store.create("s1");
    await store.create("s2");
    await store.create("s3");
    expect(store.size).toBe(3);
    store.cleanup("s2");
    expect(store.size).toBe(2);
  });
});
