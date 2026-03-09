import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({
  streamText: vi.fn(),
  Output: {
    json: vi.fn(() => "json-output"),
    object: vi.fn((opts: unknown) => ({ type: "object", ...(opts as object) })),
  },
  jsonSchema: vi.fn((s: unknown) => s),
}));

import { createStreamHandler } from "../src/stream-handler";
import { streamText, Output, jsonSchema } from "ai";
import { SSE } from "../src/sse";

const mockStreamText = vi.mocked(streamText);

// --- Helpers ---

function makeStreamResult(
  events: Array<{ type: string; [key: string]: unknown }> = [
    { type: "text-delta", text: "hello" },
  ],
  partials: unknown[] = [],
  finalObject: unknown = null,
) {
  const finish = {
    type: "finish",
    totalUsage: { inputTokens: 10, outputTokens: 5 },
  };
  const allEvents = [...events, finish];
  return {
    textStream: (async function* () {
      for (const e of events) {
        if (e.type === "text-delta") yield e.text as string;
      }
    })(),
    usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
    totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
    fullStream: (async function* () {
      for (const e of allEvents) yield e;
    })(),
    partialOutputStream: (async function* () {
      for (const p of partials) yield p;
    })(),
    output: Promise.resolve(finalObject),
  };
}

async function readSse(
  response: Response,
): Promise<Array<{ event: string; data: string; id: string }>> {
  const msgs: Array<{ event: string; data: string; id: string }> = [];
  for await (const msg of SSE.consume(response)) {
    msgs.push(msg);
  }
  return msgs;
}

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
    mockStreamText.mockImplementation(() =>
      makeStreamResult([{ type: "text-delta", text: "hello" }]),
    );
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
      const call = mockStreamText.mock.calls[0][0] as Record<string, unknown>;
      expect(call.output).toBeDefined();
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
      const call = mockStreamText.mock.calls[0][0] as Record<string, unknown>;
      expect(call.output).toBeDefined();
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
      // All three endpoints use streamText (structured uses it with output option)
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
        expect.objectContaining({
          model: "model-smart",
          output: expect.anything(),
        }),
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

describe("StreamHandler SSE wire protocol - /stream endpoint", () => {
  it("text-delta events emit numbered data chunks", async () => {
    mockStreamText.mockImplementationOnce(() =>
      makeStreamResult([
        { type: "text-delta", text: "He" },
        { type: "text-delta", text: "llo" },
      ]),
    );
    const handler = createStreamHandler({ model: "test" as any });
    const res = await handler(makeRequest("/stream", { prompt: "hi" }));
    const events = await readSse(res);
    const textChunks = events.filter((e) => e.id && !e.event);
    expect(textChunks.map((e) => e.data).join("")).toBe("Hello");
  });

  it("finish event emits usage SSE event", async () => {
    const handler = createStreamHandler({ model: "test" as any });
    const res = await handler(makeRequest("/stream", { prompt: "hi" }));
    const events = await readSse(res);
    const usageEvent = events.find((e) => e.event === "usage");
    expect(usageEvent).toBeDefined();
    const usage = JSON.parse(usageEvent!.data);
    expect(usage.inputTokens).toBe(10);
    expect(usage.outputTokens).toBe(5);
  });

  it("stream always ends with a done event", async () => {
    const handler = createStreamHandler({ model: "test" as any });
    const res = await handler(makeRequest("/stream", { prompt: "hi" }));
    const events = await readSse(res);
    expect(events.at(-1)?.event).toBe("done");
  });

  it("all text before usage and done is preserved in order", async () => {
    mockStreamText.mockImplementationOnce(() =>
      makeStreamResult([
        { type: "text-delta", text: "A" },
        { type: "text-delta", text: "B" },
        { type: "text-delta", text: "C" },
      ]),
    );
    const handler = createStreamHandler({ model: "test" as any });
    const res = await handler(makeRequest("/stream", { prompt: "hi" }));
    const events = await readSse(res);
    const ids = events.filter((e) => e.id).map((e) => parseInt(e.id));
    expect(ids).toEqual([0, 1, 2]);
    const text = events
      .filter((e) => !e.event && e.id)
      .map((e) => e.data)
      .join("");
    expect(text).toBe("ABC");
    const namedEvents = events.filter((e) => e.event);
    expect(namedEvents.map((e) => e.event)).toEqual(["usage", "done"]);
  });
});

describe("StreamHandler SSE wire protocol - /chat endpoint", () => {
  it("text-delta events emit numbered data chunks", async () => {
    mockStreamText.mockImplementationOnce(() =>
      makeStreamResult([
        { type: "text-delta", text: "Hi" },
        { type: "text-delta", text: " there" },
      ]),
    );
    const handler = createStreamHandler({ model: "test" as any });
    const res = await handler(
      makeRequest("/chat", {
        messages: [{ role: "user", content: "hello" }],
      }),
    );
    const events = await readSse(res);
    const textChunks = events.filter((e) => !e.event && e.id);
    expect(textChunks.map((e) => e.data).join("")).toBe("Hi there");
  });

  it("tool-call event emits SSE event named tool_call with correct JSON", async () => {
    mockStreamText.mockImplementationOnce(() =>
      makeStreamResult([
        {
          type: "tool-call",
          toolName: "search",
          input: { query: "cats" },
        },
        { type: "text-delta", text: "Found it" },
      ]),
    );
    const handler = createStreamHandler({ model: "test" as any });
    const res = await handler(
      makeRequest("/chat", {
        messages: [{ role: "user", content: "find cats" }],
      }),
    );
    const events = await readSse(res);
    const toolCallEvent = events.find((e) => e.event === "tool_call");
    expect(toolCallEvent).toBeDefined();
    const payload = JSON.parse(toolCallEvent!.data);
    expect(payload.name).toBe("search");
    expect(payload.args).toEqual({ query: "cats" });
  });

  it("finish event emits SSE usage event with token counts", async () => {
    mockStreamText.mockImplementationOnce(() =>
      makeStreamResult([{ type: "text-delta", text: "ok" }]),
    );
    const handler = createStreamHandler({ model: "test" as any });
    const res = await handler(
      makeRequest("/chat", {
        messages: [{ role: "user", content: "hi" }],
      }),
    );
    const events = await readSse(res);
    const usageEvent = events.find((e) => e.event === "usage");
    expect(usageEvent).toBeDefined();
    const usage = JSON.parse(usageEvent!.data);
    expect(usage.inputTokens).toBe(10);
    expect(usage.outputTokens).toBe(5);
  });

  it("chat stream ends with done event", async () => {
    const handler = createStreamHandler({ model: "test" as any });
    const res = await handler(
      makeRequest("/chat", {
        messages: [{ role: "user", content: "hi" }],
      }),
    );
    const events = await readSse(res);
    expect(events.at(-1)?.event).toBe("done");
  });

  it("multiple tool-calls all emitted as tool_call events in order", async () => {
    mockStreamText.mockImplementationOnce(() =>
      makeStreamResult([
        { type: "tool-call", toolName: "a", input: {} },
        { type: "tool-call", toolName: "b", input: { x: 1 } },
        { type: "text-delta", text: "final" },
      ]),
    );
    const handler = createStreamHandler({ model: "test" as any });
    const res = await handler(
      makeRequest("/chat", {
        messages: [{ role: "user", content: "hi" }],
      }),
    );
    const events = await readSse(res);
    const toolCalls = events.filter((e) => e.event === "tool_call");
    expect(toolCalls).toHaveLength(2);
    expect(JSON.parse(toolCalls[0]!.data).name).toBe("a");
    expect(JSON.parse(toolCalls[1]!.data).name).toBe("b");
  });

  it("event order is: tool_call(s) → text chunks → usage → done", async () => {
    mockStreamText.mockImplementationOnce(() =>
      makeStreamResult([
        { type: "tool-call", toolName: "search", input: {} },
        { type: "text-delta", text: "result" },
      ]),
    );
    const handler = createStreamHandler({ model: "test" as any });
    const res = await handler(
      makeRequest("/chat", {
        messages: [{ role: "user", content: "hi" }],
      }),
    );
    const events = await readSse(res);
    const namedEvents = events.filter((e) => e.event);
    expect(namedEvents.map((e) => e.event)).toEqual([
      "tool_call",
      "usage",
      "done",
    ]);
  });
});

describe("StreamHandler.chat - toolset wiring", () => {
  it("passes NO tools when no toolset specified in body (opt-in only)", async () => {
    const myTool = {
      description: "test",
      parameters: {} as any,
      execute: async () => ({}),
    };
    const handler = createStreamHandler({
      model: "test" as any,
      toolsets: { assistant: { myTool } },
    });
    await handler(
      makeRequest("/chat", {
        messages: [{ role: "user", content: "hi" }],
        // no toolset key — tools must NOT activate
      }),
    );
    const call = mockStreamText.mock.calls[0][0] as Record<string, unknown>;
    expect(call.tools).toBeUndefined();
  });

  it("passes tools from named toolset when toolset key specified in body", async () => {
    const searchTool = {
      description: "search",
      parameters: {} as any,
      execute: async () => ({}),
    };
    const handler = createStreamHandler({
      model: "test" as any,
      toolsets: { search: { searchTool }, billing: {} },
    });
    await handler(
      makeRequest("/chat", {
        messages: [{ role: "user", content: "hi" }],
        toolset: "search",
      }),
    );
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({ tools: { searchTool } }),
    );
  });

  it("passes no tools when toolset key does not exist in config", async () => {
    const handler = createStreamHandler({
      model: "test" as any,
      toolsets: { default: {} },
    });
    await handler(
      makeRequest("/chat", {
        messages: [{ role: "user", content: "hi" }],
        toolset: "nonexistent",
      }),
    );
    const call = mockStreamText.mock.calls[0][0] as Record<string, unknown>;
    expect(call.tools).toBeUndefined();
  });

  it("passes no tools when no toolsets configured", async () => {
    const handler = createStreamHandler({ model: "test" as any });
    await handler(
      makeRequest("/chat", {
        messages: [{ role: "user", content: "hi" }],
      }),
    );
    const call = mockStreamText.mock.calls[0][0] as Record<string, unknown>;
    expect(call.tools).toBeUndefined();
  });

  it("passes maxSteps to streamText when toolset is active and maxSteps provided", async () => {
    const handler = createStreamHandler({
      model: "test" as any,
      toolsets: {
        assistant: {
          t: {
            description: "",
            parameters: {} as any,
            execute: async () => ({}),
          },
        },
      },
    });
    await handler(
      makeRequest("/chat", {
        messages: [{ role: "user", content: "hi" }],
        toolset: "assistant",
        maxSteps: 3,
      }),
    );
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({ maxSteps: 3 }),
    );
  });

  it("does NOT pass maxSteps when no toolset is active (even if maxSteps provided)", async () => {
    const handler = createStreamHandler({ model: "test" as any });
    await handler(
      makeRequest("/chat", {
        messages: [{ role: "user", content: "hi" }],
        maxSteps: 10,
      }),
    );
    const call = mockStreamText.mock.calls[0][0] as Record<string, unknown>;
    expect(call.maxSteps).toBeUndefined();
  });

  it("returns 400 when messages array is empty", async () => {
    const handler = createStreamHandler({ model: "test" as any });
    const res = await handler(makeRequest("/chat", { messages: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when messages is missing", async () => {
    const handler = createStreamHandler({ model: "test" as any });
    const res = await handler(makeRequest("/chat", {}));
    expect(res.status).toBe(400);
  });

  it("resolves model from request body for chat", async () => {
    const handler = createStreamHandler({
      models: { fast: "model-fast" as any, smart: "model-smart" as any },
    });
    await handler(
      makeRequest("/chat", {
        messages: [{ role: "user", content: "hi" }],
        model: "smart",
      }),
    );
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({ model: "model-smart" }),
    );
  });

  it("passes system prompt to streamText for chat", async () => {
    const handler = createStreamHandler({ model: "test" as any });
    await handler(
      makeRequest("/chat", {
        messages: [{ role: "user", content: "hi" }],
        system: "Be helpful",
      }),
    );
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({ system: "Be helpful" }),
    );
  });
});

describe("StreamHandler SSE wire protocol - /structured endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits partial events for each partial object", async () => {
    mockStreamText.mockImplementationOnce(() =>
      makeStreamResult([], [{ name: "Al" }, { name: "Alice", age: 30 }], {
        name: "Alice",
        age: 30,
      }),
    );
    const handler = createStreamHandler({ model: "test" as any });
    const res = await handler(makeRequest("/structured", { prompt: "hello" }));
    const events = await readSse(res);

    const partialEvents = events.filter((e) => e.event === "partial");
    expect(partialEvents).toHaveLength(2);
    expect(JSON.parse(partialEvents[0]!.data)).toEqual({ name: "Al" });
    expect(JSON.parse(partialEvents[1]!.data)).toEqual({
      name: "Alice",
      age: 30,
    });
  });

  it("emits a data event with the final object", async () => {
    mockStreamText.mockImplementationOnce(() =>
      makeStreamResult([], [], { name: "Alice", age: 30 }),
    );
    const handler = createStreamHandler({ model: "test" as any });
    const res = await handler(makeRequest("/structured", { prompt: "hello" }));
    const events = await readSse(res);

    const dataEvent = events.find((e) => e.event === "data");
    expect(dataEvent).toBeDefined();
    expect(JSON.parse(dataEvent!.data)).toEqual({ name: "Alice", age: 30 });
  });

  it("emits usage and done events after data", async () => {
    mockStreamText.mockImplementationOnce(() =>
      makeStreamResult([], [], { result: true }),
    );
    const handler = createStreamHandler({ model: "test" as any });
    const res = await handler(makeRequest("/structured", { prompt: "hello" }));
    const events = await readSse(res);

    const namedEvents = events.filter((e) => e.event);
    const names = namedEvents.map((e) => e.event);
    expect(names).toContain("data");
    expect(names).toContain("usage");
    expect(names[names.length - 1]).toBe("done");
  });

  it("emits no partial events when partialOutputStream is empty", async () => {
    mockStreamText.mockImplementationOnce(() =>
      makeStreamResult([], [], { x: 1 }),
    );
    const handler = createStreamHandler({ model: "test" as any });
    const res = await handler(makeRequest("/structured", { prompt: "hello" }));
    const events = await readSse(res);

    const partialEvents = events.filter((e) => e.event === "partial");
    expect(partialEvents).toHaveLength(0);
  });

  it("passes output option to streamText", async () => {
    const handler = createStreamHandler({ model: "test" as any });
    await handler(
      makeRequest("/structured", {
        prompt: "hello",
        schema: { type: "object" },
      }),
    );

    const call = mockStreamText.mock.calls[0][0] as Record<string, unknown>;
    expect(call.output).toBeDefined();
    expect(call.prompt).toBe("hello");
  });
});
