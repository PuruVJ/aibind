import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({
  streamText: vi.fn(() => ({
    toTextStreamResponse: () => new Response("stream response"),
  })),
  Output: {
    json: vi.fn(() => "json-output"),
    object: vi.fn((opts: unknown) => ({ type: "object", ...(opts as object) })),
  },
  jsonSchema: vi.fn((s: unknown) => s),
}));

import { createStreamHandler } from "../src/server/handler.js";
import { streamText } from "ai";

const mockStreamText = vi.mocked(streamText);

function makeRequest(pathname: string, body: Record<string, unknown>) {
  return new Request(`http://localhost${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("createStreamHandler (Nuxt)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles /api/__aibind__/stream requests", async () => {
    const handle = createStreamHandler({ model: "test-model" });
    const response = await handle(
      makeRequest("/api/__aibind__/stream", {
        prompt: "hello",
        system: "be nice",
      }),
    );

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-model",
        prompt: "hello",
        system: "be nice",
      }),
    );
    expect(response).toBeInstanceOf(Response);
  });

  it("handles /api/__aibind__/structured requests", async () => {
    const handle = createStreamHandler({ model: "test-model" });
    await handle(
      makeRequest("/api/__aibind__/structured", { prompt: "analyze this" }),
    );

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-model",
        prompt: "analyze this",
      }),
    );
  });

  it("returns 400 for missing prompt", async () => {
    const handle = createStreamHandler({ model: "test-model" });
    const response = await handle(
      makeRequest("/api/__aibind__/stream", { prompt: "" }),
    );

    expect(response.status).toBe(400);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it("returns 404 for non-matching routes", async () => {
    const handle = createStreamHandler({ model: "test-model" });
    const response = await handle(makeRequest("/other", { prompt: "hello" }));

    expect(response.status).toBe(404);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it("supports custom prefix", async () => {
    const handle = createStreamHandler({
      model: "test-model",
      prefix: "/api/ai",
    });
    await handle(makeRequest("/api/ai/stream", { prompt: "hello" }));

    expect(mockStreamText).toHaveBeenCalled();
  });

  it("resolves named model from request body", async () => {
    const handle = createStreamHandler({
      models: { fast: "fast-model", smart: "smart-model" },
    });
    await handle(
      makeRequest("/api/__aibind__/stream", { prompt: "hello", model: "fast" }),
    );

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({ model: "fast-model" }),
    );
  });

  it("uses first model as default when no model key sent", async () => {
    const handle = createStreamHandler({
      models: { default: "default-model", fast: "fast-model" },
    });
    await handle(makeRequest("/api/__aibind__/stream", { prompt: "hello" }));

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({ model: "default-model" }),
    );
  });

  it("returns 400 for unknown model key", async () => {
    const handle = createStreamHandler({
      models: { fast: "fast-model" },
    });
    const response = await handle(
      makeRequest("/api/__aibind__/stream", {
        prompt: "hello",
        model: "unknown",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns error when no model configured", async () => {
    const handle = createStreamHandler({});
    const response = await handle(
      makeRequest("/api/__aibind__/stream", { prompt: "hello" }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/No model configured/);
  });

  it("returns 404 for GET requests", async () => {
    const handle = createStreamHandler({ model: "test-model" });
    const response = await handle(
      new Request("http://localhost/api/__aibind__/stream", { method: "GET" }),
    );

    expect(response.status).toBe(404);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it("handles structured endpoint with schema in body", async () => {
    const handle = createStreamHandler({ model: "test-model" });
    const schema = { type: "object", properties: { name: { type: "string" } } };
    await handle(
      makeRequest("/api/__aibind__/structured", { prompt: "extract", schema }),
    );

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-model",
        prompt: "extract",
        output: expect.anything(),
      }),
    );
  });
});
