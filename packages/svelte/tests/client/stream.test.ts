import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("svelte", () => ({ onDestroy: vi.fn() }));

import { Stream } from "../../src/lib/index.svelte.js";
import {
  createMockResponse,
  createErrorResponse,
  createSSEResponse,
  flushPromises,
} from "../helpers.js";

const ENDPOINT = "/api/stream";

/** Flush multiple rounds of microtasks for async SSE processing. */
async function flushDeep(rounds = 5) {
  for (let i = 0; i < rounds; i++) {
    await flushPromises();
  }
}

describe("Stream", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("send() POSTs to endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["hello"]));

    const stream = new Stream({ endpoint: ENDPOINT, fetch: mockFetch });
    stream.send("test prompt");
    await flushPromises();

    expect(mockFetch).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("test prompt"),
      }),
    );
  });

  it("send() uses custom endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["hi"]));

    const stream = new Stream({ endpoint: "/custom/stream", fetch: mockFetch });
    stream.send("hello");
    await flushPromises();

    expect(mockFetch).toHaveBeenCalledWith("/custom/stream", expect.anything());
  });

  it("send() uses custom fetch", async () => {
    const customFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(["response"]));

    const stream = new Stream({ endpoint: ENDPOINT, fetch: customFetch });
    stream.send("hello");
    await flushPromises();

    expect(customFetch).toHaveBeenCalled();
  });

  it("send() streams text chunks into .text", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(["Hello", " ", "World"]));

    const stream = new Stream({ endpoint: ENDPOINT, fetch: mockFetch });
    stream.send("prompt");
    await flushPromises();

    expect(stream.text).toBe("Hello World");
  });

  it("send() sets loading=true during stream, false after", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["hello"]));

    const stream = new Stream({ endpoint: ENDPOINT, fetch: mockFetch });
    stream.send("prompt");

    expect(stream.loading).toBe(true);
    await flushPromises();
    expect(stream.loading).toBe(false);
  });

  it("send() sets done=true when stream completes", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["done"]));

    const stream = new Stream({ endpoint: ENDPOINT, fetch: mockFetch });
    expect(stream.done).toBe(false);

    stream.send("prompt");
    await flushPromises();

    expect(stream.done).toBe(true);
  });

  it("abort() aborts in-flight request", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["hello"]));

    const stream = new Stream({ endpoint: ENDPOINT, fetch: mockFetch });
    stream.send("prompt");
    stream.abort();
    await flushPromises();

    // Should not throw, should handle abort gracefully
    expect(stream.error).toBeNull();
  });

  it("retry() re-sends last prompt", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(["response"]));

    const stream = new Stream({ endpoint: ENDPOINT, fetch: mockFetch });
    stream.send("original prompt");
    await flushPromises();

    mockFetch.mockClear();
    mockFetch.mockResolvedValue(createMockResponse(["retry response"]));

    stream.retry();
    await flushPromises();

    expect(mockFetch).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({
        body: expect.stringContaining("original prompt"),
      }),
    );
    expect(stream.text).toBe("retry response");
  });

  it("network error sets .error and calls onError", async () => {
    const onError = vi.fn();
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network failure"));

    const stream = new Stream({
      endpoint: ENDPOINT,
      fetch: mockFetch,
      onError,
    });
    stream.send("prompt");
    await flushPromises();

    expect(stream.error).toBeInstanceOf(Error);
    expect(stream.error!.message).toBe("Network failure");
    expect(onError).toHaveBeenCalledWith(stream.error);
  });

  it("HTTP error sets .error", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createErrorResponse(500, "Internal Server Error"));

    const stream = new Stream({ endpoint: ENDPOINT, fetch: mockFetch });
    stream.send("prompt");
    await flushPromises();

    expect(stream.error).toBeInstanceOf(Error);
    expect(stream.error!.message).toContain("500");
  });

  describe("SSE / resumable mode", () => {
    it("auto-detects SSE from Content-Type and sets streamId", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createSSEResponse(["Hello", " world"]));

      const stream = new Stream({ endpoint: ENDPOINT, fetch: mockFetch });
      stream.send("prompt");
      await flushDeep();

      expect(stream.streamId).toBe("test-stream-id");
      expect(stream.text).toBe("Hello world");
      expect(stream.done).toBe(true);
      expect(stream.status).toBe("done");
    });

    it("status transitions: idle → streaming → done", async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSSEResponse(["chunk"]));

      const stream = new Stream({ endpoint: ENDPOINT, fetch: mockFetch });
      expect(stream.status).toBe("idle");

      stream.send("prompt");
      expect(stream.status).toBe("streaming");

      await flushDeep();
      expect(stream.status).toBe("done");
    });

    it("stop() sends POST to stop endpoint", async () => {
      const mockFetch = vi.fn();
      // Initial stream request
      mockFetch.mockResolvedValueOnce(createSSEResponse(["chunk1", "chunk2"]));
      // Stop request
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true })),
      );

      const stream = new Stream({ endpoint: ENDPOINT, fetch: mockFetch });
      stream.send("prompt");
      await flushDeep();

      // Now stop
      await stream.stop();

      // Verify stop was called
      expect(mockFetch).toHaveBeenCalledWith(
        `${ENDPOINT}/stop`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ id: "test-stream-id" }),
        }),
      );
      expect(stream.status).toBe("stopped");
    });

    it("handles stopped event from server", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createSSEResponse(["partial"], { stopped: true }));

      const stream = new Stream({ endpoint: ENDPOINT, fetch: mockFetch });
      stream.send("prompt");
      await flushDeep();

      expect(stream.text).toBe("partial");
      expect(stream.status).toBe("stopped");
    });

    it("handles error event from server", async () => {
      const onError = vi.fn();
      const mockFetch = vi
        .fn()
        .mockResolvedValue(
          createSSEResponse(["partial"], { error: "rate limited" }),
        );

      const stream = new Stream({
        endpoint: ENDPOINT,
        fetch: mockFetch,
        onError,
      });
      stream.send("prompt");
      await flushDeep();

      expect(stream.error).toBeInstanceOf(Error);
      expect(stream.error!.message).toBe("rate limited");
      expect(stream.status).toBe("error");
      expect(onError).toHaveBeenCalled();
    });

    it("plain text responses still work (no SSE)", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createMockResponse(["Hello", " World"]));

      const stream = new Stream({ endpoint: ENDPOINT, fetch: mockFetch });
      stream.send("prompt");
      await flushDeep();

      expect(stream.streamId).toBeNull();
      expect(stream.text).toBe("Hello World");
      expect(stream.done).toBe(true);
      expect(stream.status).toBe("done");
    });

    it("abort() clears canResume and resets status", async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSSEResponse(["chunk"]));

      const stream = new Stream({ endpoint: ENDPOINT, fetch: mockFetch });
      stream.send("prompt");
      stream.abort();
      await flushDeep();

      expect(stream.canResume).toBe(false);
      expect(stream.status).not.toBe("streaming");
    });

    it("onFinish is called with SSE text", async () => {
      const onFinish = vi.fn();
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createSSEResponse(["Hello", " World"]));

      const stream = new Stream({
        endpoint: ENDPOINT,
        fetch: mockFetch,
        onFinish,
      });
      stream.send("prompt");
      await flushDeep();

      expect(onFinish).toHaveBeenCalledWith("Hello World");
    });
  });
});
