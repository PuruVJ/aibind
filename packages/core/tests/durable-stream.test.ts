import { describe, it, expect, beforeEach } from "vitest";
import {
  createDurableStream,
  createResumeResponse,
} from "../src/durable-stream";
import { MemoryStreamStore } from "../src/memory-store";
import { consumeSSEStream } from "../src/sse";

/** Helper: create an async iterable from an array of strings. */
async function* fromArray(chunks: string[]): AsyncGenerator<string> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

/** Helper: create a slow async iterable that yields chunks with delays. */
async function* slowSource(
  chunks: string[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  for (const chunk of chunks) {
    if (signal?.aborted) return;
    await new Promise((r) => setTimeout(r, 5));
    yield chunk;
  }
}

/** Collect all SSE messages from a Response. */
async function collectSSE(response: Response) {
  const msgs = [];
  for await (const msg of consumeSSEStream(response)) {
    msgs.push(msg);
  }
  return msgs;
}

describe("createDurableStream", () => {
  let store: MemoryStreamStore;

  beforeEach(() => {
    store = new MemoryStreamStore();
  });

  it("returns streamId, response, and controller", async () => {
    const result = await createDurableStream({
      store,
      source: fromArray(["hi"]),
    });
    expect(result.streamId).toBeTruthy();
    expect(result.response).toBeInstanceOf(Response);
    expect(result.controller).toBeInstanceOf(AbortController);
  });

  it("response has SSE headers", async () => {
    const { response } = await createDurableStream({
      store,
      source: fromArray(["hi"]),
    });
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(response.headers.get("X-Stream-Id")).toBeTruthy();
  });

  it("streams chunks as SSE events", async () => {
    const { response } = await createDurableStream({
      store,
      source: fromArray(["Hello", " world", "!"]),
    });

    const msgs = await collectSSE(response);

    // First event is stream-id
    expect(msgs[0]!.event).toBe("stream-id");

    // Content chunks
    const chunks = msgs.filter((m) => !m.event);
    expect(chunks.map((c) => c.data)).toEqual(["Hello", " world", "!"]);
    expect(chunks.map((c) => c.id)).toEqual(["1", "2", "3"]);

    // Last event is done
    expect(msgs[msgs.length - 1]!.event).toBe("done");
  });

  it("marks store as complete after source ends", async () => {
    const { streamId } = await createDurableStream({
      store,
      source: fromArray(["a", "b"]),
    });

    // Wait for pipe to finish
    await new Promise((r) => setTimeout(r, 50));

    const status = await store.getStatus(streamId);
    expect(status!.state).toBe("done");
    expect(status!.totalChunks).toBe(2);
  });

  it("stop via controller marks store as stopped", async () => {
    const { streamId, controller } = await createDurableStream({
      store,
      source: slowSource(["a", "b", "c", "d", "e"]),
    });

    // Let first chunk through, then stop
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    await new Promise((r) => setTimeout(r, 50));

    const status = await store.getStatus(streamId);
    expect(status!.state).toBe("stopped");
  });

  it("SSE response includes stopped event when aborted", async () => {
    const { response, controller } = await createDurableStream({
      store,
      source: slowSource(Array.from({ length: 20 }, (_, i) => `chunk${i}`)),
    });

    // Stop after a short delay
    setTimeout(() => controller.abort(), 15);

    const msgs = await collectSSE(response);
    const events = msgs.filter((m) => m.event);
    const eventNames = events.map((e) => e.event);

    expect(eventNames).toContain("stream-id");
    expect(eventNames).toContain("stopped");
    expect(eventNames).toContain("done");
  });

  it("handles source errors", async () => {
    async function* failingSource(): AsyncGenerator<string> {
      yield "ok";
      throw new Error("LLM crashed");
    }

    const { streamId, response } = await createDurableStream({
      store,
      source: failingSource(),
    });

    const msgs = await collectSSE(response);
    const errorEvent = msgs.find((m) => m.event === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.data).toBe("LLM crashed");

    // Wait for pipe
    await new Promise((r) => setTimeout(r, 50));
    const status = await store.getStatus(streamId);
    expect(status!.state).toBe("error");
  });
});

describe("createResumeResponse", () => {
  let store: MemoryStreamStore;

  beforeEach(() => {
    store = new MemoryStreamStore();
  });

  it("resumes from a given sequence", async () => {
    // Manually populate store
    await store.create("s1");
    await store.append("s1", "a");
    await store.append("s1", "b");
    await store.append("s1", "c");
    await store.complete("s1");

    const response = createResumeResponse({
      store,
      streamId: "s1",
      afterSeq: 1,
    });

    const msgs = await collectSSE(response);
    // No stream-id event on resume
    const chunks = msgs.filter((m) => !m.event);
    expect(chunks.map((c) => c.data)).toEqual(["b", "c"]);
    expect(msgs[msgs.length - 1]!.event).toBe("done");
  });

  it("returns only terminal event when already past all chunks", async () => {
    await store.create("s1");
    await store.append("s1", "a");
    await store.complete("s1");

    const response = createResumeResponse({
      store,
      streamId: "s1",
      afterSeq: 5,
    });

    const msgs = await collectSSE(response);
    const chunks = msgs.filter((m) => !m.event);
    expect(chunks).toEqual([]);
    expect(msgs[msgs.length - 1]!.event).toBe("done");
  });

  it("resumes from afterSeq=0 to get all chunks", async () => {
    await store.create("s1");
    await store.append("s1", "x");
    await store.append("s1", "y");
    await store.complete("s1");

    const response = createResumeResponse({
      store,
      streamId: "s1",
      afterSeq: 0,
    });

    const msgs = await collectSSE(response);
    // No stream-id event (resume never sends it)
    expect(msgs.find((m) => m.event === "stream-id")).toBeUndefined();

    const chunks = msgs.filter((m) => !m.event);
    expect(chunks.map((c) => c.data)).toEqual(["x", "y"]);
  });

  it("includes stopped event for stopped streams", async () => {
    await store.create("s1");
    await store.append("s1", "partial");
    await store.stop("s1");

    const response = createResumeResponse({
      store,
      streamId: "s1",
      afterSeq: 0,
    });

    const msgs = await collectSSE(response);
    const events = msgs.filter((m) => m.event).map((m) => m.event);
    expect(events).toContain("stopped");
    expect(events).toContain("done");
  });

  it("includes error event for failed streams", async () => {
    await store.create("s1");
    await store.append("s1", "partial");
    await store.fail("s1", "timeout");

    const response = createResumeResponse({
      store,
      streamId: "s1",
      afterSeq: 0,
    });

    const msgs = await collectSSE(response);
    const errorEvent = msgs.find((m) => m.event === "error");
    expect(errorEvent!.data).toBe("timeout");
  });

  it("has SSE response headers", async () => {
    await store.create("s1");
    await store.complete("s1");

    const response = createResumeResponse({
      store,
      streamId: "s1",
      afterSeq: 0,
    });

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
  });
});
