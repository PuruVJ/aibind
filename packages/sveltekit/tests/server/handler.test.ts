import { describe, it, expect, vi, beforeEach } from "vitest";

async function* fakeTextStream() {
  yield "Hello";
  yield " world";
}

vi.mock("ai", () => ({
  streamText: vi.fn(() => ({
    toTextStreamResponse: () => new Response("stream response"),
    textStream: fakeTextStream(),
  })),
  Output: {
    json: vi.fn(() => "json-output"),
    object: vi.fn((opts: unknown) => ({ type: "object", ...(opts as object) })),
  },
  jsonSchema: vi.fn((s: unknown) => s),
}));

import { createStreamHandler } from "../../src/lib/server/handler.js";
import { MemoryStreamStore } from "../../../core/src/memory-store";
import { streamText } from "ai";

const mockStreamText = vi.mocked(streamText);

function makeEvent(pathname: string, body: Record<string, unknown>) {
  return {
    url: new URL(`http://localhost${pathname}`),
    request: new Request(`http://localhost${pathname}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  };
}

const mockResolve = vi.fn(() => Promise.resolve(new Response("resolved")));

describe("createStreamHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles /__aibind__/stream requests", async () => {
    const handle = createStreamHandler({ model: "test-model" });
    const event = makeEvent("/__aibind__/stream", {
      prompt: "hello",
      system: "be nice",
    });

    const response = await handle({ event, resolve: mockResolve });

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-model",
        prompt: "hello",
        system: "be nice",
      }),
    );
    expect(mockResolve).not.toHaveBeenCalled();
    expect(response).toBeInstanceOf(Response);
  });

  it("handles /__aibind__/structured requests", async () => {
    const handle = createStreamHandler({ model: "test-model" });
    const event = makeEvent("/__aibind__/structured", {
      prompt: "analyze this",
    });

    await handle({ event, resolve: mockResolve });

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-model",
        prompt: "analyze this",
      }),
    );
  });

  it("returns 400 for missing prompt", async () => {
    const handle = createStreamHandler({ model: "test-model" });
    const event = makeEvent("/__aibind__/stream", { prompt: "" });

    const response = await handle({ event, resolve: mockResolve });

    expect(response.status).toBe(400);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it("falls through to resolve for non-matching routes", async () => {
    const handle = createStreamHandler({ model: "test-model" });
    const event = makeEvent("/other", { prompt: "hello" });

    await handle({ event, resolve: mockResolve });

    expect(mockResolve).toHaveBeenCalledWith(event);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it("supports custom prefix", async () => {
    const handle = createStreamHandler({
      model: "test-model",
      prefix: "/api/ai",
    });
    const event = makeEvent("/api/ai/stream", { prompt: "hello" });

    await handle({ event, resolve: mockResolve });

    expect(mockStreamText).toHaveBeenCalled();
  });

  it("resolves named model from request body", async () => {
    const handle = createStreamHandler({
      models: { fast: "fast-model", smart: "smart-model" },
    });
    const event = makeEvent("/__aibind__/stream", {
      prompt: "hello",
      model: "fast",
    });

    await handle({ event, resolve: mockResolve });

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({ model: "fast-model" }),
    );
  });

  it("uses first model as default when no model key sent", async () => {
    const handle = createStreamHandler({
      models: { default: "default-model", fast: "fast-model" },
    });
    const event = makeEvent("/__aibind__/stream", { prompt: "hello" });

    await handle({ event, resolve: mockResolve });

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({ model: "default-model" }),
    );
  });

  it("throws for unknown model key", async () => {
    const handle = createStreamHandler({
      models: { fast: "fast-model" },
    });
    const event = makeEvent("/__aibind__/stream", {
      prompt: "hello",
      model: "unknown",
    });

    const response = await handle({ event, resolve: mockResolve });

    expect(response.status).toBe(400);
  });

  it("returns error when no model configured", async () => {
    const handle = createStreamHandler({});
    const event = makeEvent("/__aibind__/stream", { prompt: "hello" });

    const response = await handle({ event, resolve: mockResolve });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/No model configured/);
  });

  it("falls through for GET requests", async () => {
    const handle = createStreamHandler({ model: "test-model" });
    const event = {
      url: new URL("http://localhost/__aibind__/stream"),
      request: new Request("http://localhost/__aibind__/stream", {
        method: "GET",
      }),
    };

    await handle({ event, resolve: mockResolve });

    expect(mockResolve).toHaveBeenCalledWith(event);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it("returns 400 for whitespace-only prompt", async () => {
    const handle = createStreamHandler({ model: "test-model" });
    const event = makeEvent("/__aibind__/stream", { prompt: "   " });

    const response = await handle({ event, resolve: mockResolve });

    expect(response.status).toBe(400);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it("handles structured endpoint with schema in body", async () => {
    const handle = createStreamHandler({ model: "test-model" });
    const schema = { type: "object", properties: { name: { type: "string" } } };
    const event = makeEvent("/__aibind__/structured", {
      prompt: "extract",
      schema,
    });

    await handle({ event, resolve: mockResolve });

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-model",
        prompt: "extract",
        output: expect.anything(),
      }),
    );
  });

  describe("resumable mode", () => {
    function makeResumableHandler() {
      const store = new MemoryStreamStore();
      const handle = createStreamHandler({
        model: "test-model",
        resumable: true,
        store,
      });
      return { handle, store };
    }

    it("returns SSE response when resumable is true", async () => {
      const { handle } = makeResumableHandler();
      const event = makeEvent("/__aibind__/stream", { prompt: "hello" });

      const response = await handle({ event, resolve: mockResolve });

      expect(response.headers.get("Content-Type")).toBe("text/event-stream");
      expect(response.headers.get("X-Stream-Id")).toBeTruthy();
    });

    it("handles stop endpoint", async () => {
      const { handle } = makeResumableHandler();

      // Start a stream first to register a controller
      const startEvent = makeEvent("/__aibind__/stream", { prompt: "hello" });
      const startResponse = await handle({
        event: startEvent,
        resolve: mockResolve,
      });
      const streamId = startResponse.headers.get("X-Stream-Id")!;

      // Stop it
      const stopEvent = makeEvent("/__aibind__/stream/stop", { id: streamId });
      const stopResponse = await handle({
        event: stopEvent,
        resolve: mockResolve,
      });

      expect(stopResponse.status).toBe(200);
      const body = await stopResponse.json();
      expect(body.ok).toBe(true);
    });

    it("handles resume endpoint", async () => {
      const store = new MemoryStreamStore();

      // Pre-populate store
      await store.create("test-stream");
      await store.append("test-stream", "a");
      await store.append("test-stream", "b");
      await store.complete("test-stream");

      const handle = createStreamHandler({
        model: "test-model",
        resumable: true,
        store,
      });

      const url = new URL(
        "http://localhost/__aibind__/stream/resume?id=test-stream&after=1",
      );
      const event = {
        url,
        request: new Request(url, { method: "GET" }),
      };

      const response = await handle({ event, resolve: mockResolve });

      expect(response.headers.get("Content-Type")).toBe("text/event-stream");
      expect(mockResolve).not.toHaveBeenCalled();
    });

    it("returns 400 for stop without id", async () => {
      const { handle } = makeResumableHandler();
      const event = makeEvent("/__aibind__/stream/stop", {});

      const response = await handle({ event, resolve: mockResolve });

      expect(response.status).toBe(400);
    });

    it("returns 400 for resume without id", async () => {
      const { handle } = makeResumableHandler();
      const url = new URL("http://localhost/__aibind__/stream/resume");
      const event = {
        url,
        request: new Request(url, { method: "GET" }),
      };

      const response = await handle({ event, resolve: mockResolve });

      expect(response.status).toBe(400);
    });

    it("falls through resume/stop when resumable is false", async () => {
      const handle = createStreamHandler({ model: "test-model" });

      const stopEvent = makeEvent("/__aibind__/stream/stop", {
        id: "test",
      });
      await handle({ event: stopEvent, resolve: mockResolve });
      expect(mockResolve).toHaveBeenCalled();

      mockResolve.mockClear();

      const url = new URL(
        "http://localhost/__aibind__/stream/resume?id=test&after=0",
      );
      const resumeEvent = {
        url,
        request: new Request(url, { method: "GET" }),
      };
      await handle({ event: resumeEvent, resolve: mockResolve });
      expect(mockResolve).toHaveBeenCalled();
    });
  });
});
