import { describe, it, expect } from "vitest";
import { AgentStream, type AgentStreamEvent } from "../src/agent-stream";

/** Helper: create a mock async iterable of AI SDK fullStream events. */
async function* mockFullStream(
  parts: Array<Record<string, unknown>>,
): AsyncGenerator<Record<string, unknown>> {
  for (const part of parts) {
    yield part;
  }
}

/** Helper: collect all events from a response. */
async function collectEvents(response: Response): Promise<AgentStreamEvent[]> {
  const events: AgentStreamEvent[] = [];
  for await (const event of AgentStream.consume(response)) {
    events.push(event);
  }
  return events;
}

describe("AgentStream.createResponse", () => {
  it("maps text-delta events", async () => {
    const stream = mockFullStream([
      { type: "text-delta", id: "t1", text: "Hello " },
      { type: "text-delta", id: "t2", text: "world" },
    ]);

    const response = AgentStream.createResponse(stream);
    const events = await collectEvents(response);

    expect(events).toEqual([
      { type: "text-delta", text: "Hello " },
      { type: "text-delta", text: "world" },
      { type: "done" },
    ]);
  });

  it("maps tool-call events", async () => {
    const stream = mockFullStream([
      {
        type: "tool-call",
        toolCallId: "tc_1",
        toolName: "get_weather",
        input: { city: "London" },
      },
    ]);

    const response = AgentStream.createResponse(stream);
    const events = await collectEvents(response);

    expect(events).toEqual([
      {
        type: "tool-call",
        toolCallId: "tc_1",
        toolName: "get_weather",
        args: { city: "London" },
      },
      { type: "done" },
    ]);
  });

  it("maps tool-result events", async () => {
    const stream = mockFullStream([
      {
        type: "tool-result",
        toolCallId: "tc_1",
        toolName: "get_weather",
        output: { temp: 20, condition: "sunny" },
      },
    ]);

    const response = AgentStream.createResponse(stream);
    const events = await collectEvents(response);

    expect(events).toEqual([
      {
        type: "tool-result",
        toolCallId: "tc_1",
        toolName: "get_weather",
        result: { temp: 20, condition: "sunny" },
      },
      { type: "done" },
    ]);
  });

  it("maps tool-result errors", async () => {
    const stream = mockFullStream([
      {
        type: "tool-result",
        toolCallId: "tc_1",
        toolName: "get_weather",
        errorText: "API rate limited",
      },
    ]);

    const response = AgentStream.createResponse(stream);
    const events = await collectEvents(response);

    expect(events).toEqual([
      {
        type: "tool-result-error",
        toolCallId: "tc_1",
        toolName: "get_weather",
        error: "API rate limited",
      },
      { type: "done" },
    ]);
  });

  it("maps approval-request events", async () => {
    const stream = mockFullStream([
      {
        type: "tool-approval-request",
        approvalId: "ap_1",
        toolCallId: "tc_2",
        toolCall: {
          toolName: "delete_file",
          input: { path: "/data.csv" },
        },
      },
    ]);

    const response = AgentStream.createResponse(stream);
    const events = await collectEvents(response);

    expect(events).toEqual([
      {
        type: "approval-request",
        approvalId: "ap_1",
        toolCallId: "tc_2",
        toolName: "delete_file",
        args: { path: "/data.csv" },
      },
      { type: "done" },
    ]);
  });

  it("maps step-finish events", async () => {
    const stream = mockFullStream([
      { type: "step-finish", stepNumber: 0 },
      { type: "step-finish", stepNumber: 1 },
    ]);

    const response = AgentStream.createResponse(stream);
    const events = await collectEvents(response);

    expect(events).toEqual([
      { type: "step-finish", stepNumber: 0 },
      { type: "step-finish", stepNumber: 1 },
      { type: "done" },
    ]);
  });

  it("skips unknown events", async () => {
    const stream = mockFullStream([
      { type: "reasoning-delta", text: "thinking..." },
      { type: "text-delta", id: "t1", text: "Hello" },
      { type: "source", id: "s1", url: "https://example.com" },
    ]);

    const response = AgentStream.createResponse(stream);
    const events = await collectEvents(response);

    expect(events).toEqual([
      { type: "text-delta", text: "Hello" },
      { type: "done" },
    ]);
  });

  it("handles multi-step tool call flow", async () => {
    const stream = mockFullStream([
      { type: "text-delta", id: "t1", text: "Let me check. " },
      {
        type: "tool-call",
        toolCallId: "tc_1",
        toolName: "get_weather",
        input: { city: "London" },
      },
      {
        type: "tool-result",
        toolCallId: "tc_1",
        toolName: "get_weather",
        output: { temp: 20 },
      },
      { type: "step-finish", stepNumber: 0 },
      { type: "text-delta", id: "t2", text: "It's 20°C in London." },
      { type: "step-finish", stepNumber: 1 },
    ]);

    const response = AgentStream.createResponse(stream);
    const events = await collectEvents(response);

    expect(events).toEqual([
      { type: "text-delta", text: "Let me check. " },
      {
        type: "tool-call",
        toolCallId: "tc_1",
        toolName: "get_weather",
        args: { city: "London" },
      },
      {
        type: "tool-result",
        toolCallId: "tc_1",
        toolName: "get_weather",
        result: { temp: 20 },
      },
      { type: "step-finish", stepNumber: 0 },
      { type: "text-delta", text: "It's 20°C in London." },
      { type: "step-finish", stepNumber: 1 },
      { type: "done" },
    ]);
  });

  it("handles errors in the fullStream", async () => {
    async function* failingStream(): AsyncGenerator<Record<string, unknown>> {
      yield { type: "text-delta", id: "t1", text: "Hello" };
      throw new Error("Stream broke");
    }

    const response = AgentStream.createResponse(failingStream());
    const events = await collectEvents(response);

    expect(events).toEqual([
      { type: "text-delta", text: "Hello" },
      { type: "error", error: "Stream broke" },
      { type: "done" },
    ]);
  });

  it("returns correct headers", () => {
    const stream = mockFullStream([]);
    const response = AgentStream.createResponse(stream);

    expect(response.headers.get("Content-Type")).toBe("application/x-ndjson");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
  });
});

describe("AgentStream.consume", () => {
  it("parses NDJSON lines", async () => {
    const body = [
      '{"type":"text-delta","text":"Hi"}\n',
      '{"type":"done"}\n',
    ].join("");

    const response = new Response(body, {
      headers: { "Content-Type": "application/x-ndjson" },
    });

    const events = await collectEvents(response);
    expect(events).toEqual([
      { type: "text-delta", text: "Hi" },
      { type: "done" },
    ]);
  });

  it("handles chunked delivery", async () => {
    const chunks = [
      '{"type":"text-del',
      'ta","text":"Hello"}\n{"type"',
      ':"done"}\n',
    ];

    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });

    const response = new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson" },
    });

    const events = await collectEvents(response);
    expect(events).toEqual([
      { type: "text-delta", text: "Hello" },
      { type: "done" },
    ]);
  });

  it("skips empty lines", async () => {
    const body = '{"type":"text-delta","text":"Hi"}\n\n\n{"type":"done"}\n';
    const response = new Response(body);
    const events = await collectEvents(response);

    expect(events).toEqual([
      { type: "text-delta", text: "Hi" },
      { type: "done" },
    ]);
  });

  it("round-trips through createResponse + consume", async () => {
    const parts = [
      { type: "text-delta", id: "t1", text: "Hello " },
      {
        type: "tool-call",
        toolCallId: "tc_1",
        toolName: "greet",
        input: { name: "World" },
      },
      {
        type: "tool-result",
        toolCallId: "tc_1",
        toolName: "greet",
        output: "Hello World!",
      },
      { type: "step-finish", stepNumber: 0 },
    ];

    const response = AgentStream.createResponse(mockFullStream(parts));
    const events = await collectEvents(response);

    expect(events.length).toBe(5); // 4 mapped + done
    expect(events[0]).toEqual({ type: "text-delta", text: "Hello " });
    expect(events[1]).toEqual({
      type: "tool-call",
      toolCallId: "tc_1",
      toolName: "greet",
      args: { name: "World" },
    });
    expect(events[2]).toEqual({
      type: "tool-result",
      toolCallId: "tc_1",
      toolName: "greet",
      result: "Hello World!",
    });
    expect(events[3]).toEqual({ type: "step-finish", stepNumber: 0 });
    expect(events[4]).toEqual({ type: "done" });
  });
});
