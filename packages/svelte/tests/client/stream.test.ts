import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("svelte", () => ({ onDestroy: vi.fn() }));

import { Stream } from "../../src/lib/index.svelte.js";
import {
  createMockResponse,
  createErrorResponse,
  flushPromises,
} from "../helpers.js";

const ENDPOINT = "/api/stream";

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
});
