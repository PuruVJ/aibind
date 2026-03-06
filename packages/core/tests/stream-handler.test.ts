import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({
  streamText: vi.fn(() => ({
    textStream: (async function* () {
      yield "hello";
    })(),
    usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
  })),
  Output: {
    json: vi.fn(() => "json-output"),
    object: vi.fn((opts: unknown) => ({ type: "object", ...(opts as object) })),
  },
  jsonSchema: vi.fn((s: unknown) => s),
}));

import { createStreamHandler } from "../src/stream-handler";
import { streamText, Output, jsonSchema } from "ai";

const mockStreamText = vi.mocked(streamText);

// --- Helpers ---

function makeRequest(
  pathname: string,
  body?: Record<string, unknown>,
  method = "POST",
  prefix = "/__aibind__",
): Request {
  const url = `http://localhost${prefix}${pathname}`;
  if (method === "GET") {
    return new Request(url, { method: "GET" });
  }
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function makeGetRequest(pathname: string, prefix = "/__aibind__"): Request {
  return new Request(`http://localhost${prefix}${pathname}`, {
    method: "GET",
  });
}

// --- Tests ---

describe("createStreamHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamText.mockReturnValue({
      textStream: (async function* () {
        yield "hello";
      })(),
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
    } as never);
  });

  // --- Route handling ---

  describe("routing", () => {
    it("handles POST /__aibind__/stream", async () => {
      const handler = createStreamHandler({ model: "test-model" as any });
      const res = await handler(makeRequest("/stream", { prompt: "hello" }));
      expect(res.status).toBe(200);
    });

    it("handles POST /__aibind__/structured", async () => {
      const handler = createStreamHandler({ model: "test-model" as any });
      const res = await handler(
        makeRequest("/structured", { prompt: "hello" }),
      );
      expect(res.status).toBe(200);
    });

    it("returns 404 for unknown routes", async () => {
      const handler = createStreamHandler({ model: "test-model" as any });
      const res = await handler(makeRequest("/unknown", { prompt: "hi" }));
      expect(res.status).toBe(404);
    });

    it("returns 404 for GET on non-resume routes", async () => {
      const handler = createStreamHandler({ model: "test-model" as any });
      const res = await handler(makeGetRequest("/stream"));
      expect(res.status).toBe(404);
    });

    it("supports custom prefix", async () => {
      const handler = createStreamHandler({
        model: "test-model" as any,
        prefix: "/api/ai",
      });
      const res = await handler(
        makeRequest("/stream", { prompt: "hi" }, "POST", "/api/ai"),
      );
      expect(res.status).toBe(200);
    });
  });

  // --- Prompt validation ---

  describe("prompt validation", () => {
    it("returns 400 for missing prompt", async () => {
      const handler = createStreamHandler({ model: "test-model" as any });
      const res = await handler(makeRequest("/stream", {}));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/prompt/i);
    });

    it("returns 400 for empty prompt", async () => {
      const handler = createStreamHandler({ model: "test-model" as any });
      const res = await handler(makeRequest("/stream", { prompt: "   " }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for non-string prompt", async () => {
      const handler = createStreamHandler({ model: "test-model" as any });
      const res = await handler(makeRequest("/stream", { prompt: 42 as any }));
      expect(res.status).toBe(400);
    });
  });

  // --- Model resolution ---

  describe("model resolution", () => {
    it("uses single model config", async () => {
      const handler = createStreamHandler({ model: "my-model" as any });
      await handler(makeRequest("/stream", { prompt: "hello" }));

      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({ model: "my-model" }),
      );
    });

    it("resolves named model from request", async () => {
      const handler = createStreamHandler({
        models: { fast: "model-fast" as any, smart: "model-smart" as any },
      });
      await handler(
        makeRequest("/stream", { prompt: "hello", model: "smart" }),
      );

      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({ model: "model-smart" }),
      );
    });

    it("defaults to first named model when none specified", async () => {
      const handler = createStreamHandler({
        models: { fast: "model-fast" as any, smart: "model-smart" as any },
      });
      await handler(makeRequest("/stream", { prompt: "hello" }));

      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({ model: "model-fast" }),
      );
    });

    it("returns 400 for unknown model key", async () => {
      const handler = createStreamHandler({
        models: { fast: "model-fast" as any },
      });
      const res = await handler(
        makeRequest("/stream", { prompt: "hello", model: "nonexistent" }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/nonexistent/);
    });

    it("returns 400 when no model configured at all", async () => {
      const handler = createStreamHandler({});
      const res = await handler(makeRequest("/stream", { prompt: "hello" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/model/i);
    });
  });

  // --- Structured output ---

  describe("structured output", () => {
    it("uses Output.json when no schema provided", async () => {
      const handler = createStreamHandler({ model: "test" as any });
      await handler(makeRequest("/structured", { prompt: "hello" }));

      expect(Output.json).toHaveBeenCalled();
    });

    it("uses Output.object with schema when provided", async () => {
      const handler = createStreamHandler({ model: "test" as any });
      await handler(
        makeRequest("/structured", {
          prompt: "hello",
          schema: { type: "object", properties: { name: { type: "string" } } },
        }),
      );

      expect(Output.object).toHaveBeenCalled();
      expect(jsonSchema).toHaveBeenCalled();
    });

    it("passes system prompt to streamText", async () => {
      const handler = createStreamHandler({ model: "test" as any });
      await handler(
        makeRequest("/stream", {
          prompt: "hello",
          system: "Be helpful",
        }),
      );

      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({ system: "Be helpful" }),
      );
    });
  });

  // --- Resumable streams ---

  describe("resumable streams", () => {
    it("returns 404 for stop when resumable not enabled", async () => {
      const handler = createStreamHandler({ model: "test" as any });
      const res = await handler(makeRequest("/stream/stop", { id: "test-id" }));
      expect(res.status).toBe(404);
    });

    it("returns 404 for resume when resumable not enabled", async () => {
      const handler = createStreamHandler({ model: "test" as any });
      const res = await handler(
        makeGetRequest("/stream/resume?id=test&after=0"),
      );
      expect(res.status).toBe(404);
    });

    it("accepts stop request when resumable is enabled", async () => {
      const handler = createStreamHandler({
        model: "test" as any,
        resumable: true,
      });
      const res = await handler(makeRequest("/stream/stop", { id: "test-id" }));
      // Should return ok (even if stream not found)
      expect(res.status).toBe(200);
    });

    it("stop returns 400 when id is missing", async () => {
      const handler = createStreamHandler({
        model: "test" as any,
        resumable: true,
      });
      const res = await handler(makeRequest("/stream/stop", {}));
      expect(res.status).toBe(400);
    });

    it("resume returns 400 when id is missing", async () => {
      const handler = createStreamHandler({
        model: "test" as any,
        resumable: true,
      });
      const res = await handler(makeGetRequest("/stream/resume"));
      expect(res.status).toBe(400);
    });
  });

  // --- Edge cases ---

  describe("edge cases", () => {
    it("default prefix is /__aibind__", async () => {
      const handler = createStreamHandler({ model: "test" as any });
      const res = await handler(makeRequest("/stream", { prompt: "hi" }));
      expect(res.status).toBe(200);
    });

    it("stream response uses SSE content-type when not resumable", async () => {
      const handler = createStreamHandler({ model: "test" as any });
      const res = await handler(makeRequest("/stream", { prompt: "hi" }));

      expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    });

    it("handler is reusable across multiple requests", async () => {
      const handler = createStreamHandler({ model: "test" as any });

      const res1 = await handler(makeRequest("/stream", { prompt: "one" }));
      const res2 = await handler(makeRequest("/stream", { prompt: "two" }));
      const res3 = await handler(
        makeRequest("/structured", { prompt: "three" }),
      );

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res3.status).toBe(200);
      expect(mockStreamText).toHaveBeenCalledTimes(3);
    });

    it("stop with non-string id returns 400", async () => {
      const handler = createStreamHandler({
        model: "test" as any,
        resumable: true,
      });
      const res = await handler(makeRequest("/stream/stop", { id: 123 }));
      expect(res.status).toBe(400);
    });

    it("structured with both model and schema resolves correctly", async () => {
      const handler = createStreamHandler({
        models: { fast: "model-fast" as any, smart: "model-smart" as any },
      });
      await handler(
        makeRequest("/structured", {
          prompt: "hello",
          model: "smart",
          schema: { type: "object" },
        }),
      );

      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({ model: "model-smart" }),
      );
      expect(Output.object).toHaveBeenCalled();
    });

    it("does not pass output when streaming (non-structured)", async () => {
      const handler = createStreamHandler({ model: "test" as any });
      await handler(makeRequest("/stream", { prompt: "hello" }));

      const call = mockStreamText.mock.calls[0][0] as Record<string, unknown>;
      expect(call.output).toBeUndefined();
    });

    it("returns 404 for PUT and DELETE methods", async () => {
      const handler = createStreamHandler({ model: "test" as any });

      const putRes = await handler(
        new Request("http://localhost/__aibind__/stream", {
          method: "PUT",
          body: JSON.stringify({ prompt: "hi" }),
        }),
      );
      expect(putRes.status).toBe(404);

      const deleteRes = await handler(
        new Request("http://localhost/__aibind__/stream", {
          method: "DELETE",
        }),
      );
      expect(deleteRes.status).toBe(404);
    });

    it("stop returns ok even when stream not found (idempotent)", async () => {
      const handler = createStreamHandler({
        model: "test" as any,
        resumable: true,
      });
      const res = await handler(
        makeRequest("/stream/stop", { id: "nonexistent-stream" }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it("multiple handlers have independent configs", async () => {
      const handler1 = createStreamHandler({
        model: "model-a" as any,
        prefix: "/a",
      });
      const handler2 = createStreamHandler({
        model: "model-b" as any,
        prefix: "/b",
      });

      await handler1(makeRequest("/stream", { prompt: "hi" }, "POST", "/a"));
      await handler2(makeRequest("/stream", { prompt: "hi" }, "POST", "/b"));

      expect(mockStreamText).toHaveBeenCalledTimes(2);
      const call1 = mockStreamText.mock.calls[0][0] as Record<string, unknown>;
      const call2 = mockStreamText.mock.calls[1][0] as Record<string, unknown>;
      expect(call1.model).toBe("model-a");
      expect(call2.model).toBe("model-b");
    });

    it("prompt with only whitespace is rejected", async () => {
      const handler = createStreamHandler({ model: "test" as any });
      const res = await handler(makeRequest("/stream", { prompt: "\t \n" }));
      expect(res.status).toBe(400);
    });
  });
});
