import { describe, it, expect } from "vitest";
import { SSE } from "../src/sse";

describe("SSE.format", () => {
  it("formats a simple message", () => {
    expect(SSE.format(1, "hello")).toBe("id: 1\ndata: hello\n\n");
  });

  it("formats with event type", () => {
    expect(SSE.format("abc", "test", "stream-id")).toBe(
      "event: stream-id\nid: abc\ndata: test\n\n",
    );
  });

  it("handles multi-line data", () => {
    expect(SSE.format(1, "line1\nline2\nline3")).toBe(
      "id: 1\ndata: line1\ndata: line2\ndata: line3\n\n",
    );
  });

  it("handles empty data", () => {
    expect(SSE.format(1, "")).toBe("id: 1\ndata: \n\n");
  });
});

describe("SSE.formatEvent", () => {
  it("formats a terminal event", () => {
    expect(SSE.formatEvent("done")).toBe("event: done\ndata: \n\n");
  });

  it("formats an event with data", () => {
    expect(SSE.formatEvent("error", "rate limited")).toBe(
      "event: error\ndata: rate limited\n\n",
    );
  });
});

describe("SSE.consume", () => {
  function makeResponse(text: string): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  function makeChunkedResponse(chunks: string[]): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  it("parses a single event", async () => {
    const resp = makeResponse("id: 1\ndata: hello\n\n");
    const msgs = [];
    for await (const msg of SSE.consume(resp)) msgs.push(msg);
    expect(msgs).toEqual([{ id: "1", data: "hello", event: "" }]);
  });

  it("parses multiple events", async () => {
    const resp = makeResponse("id: 1\ndata: hello\n\nid: 2\ndata: world\n\n");
    const msgs = [];
    for await (const msg of SSE.consume(resp)) msgs.push(msg);
    expect(msgs).toEqual([
      { id: "1", data: "hello", event: "" },
      { id: "2", data: "world", event: "" },
    ]);
  });

  it("parses events with event field", async () => {
    const resp = makeResponse(
      "event: stream-id\nid: abc\ndata: myid\n\nid: 1\ndata: chunk\n\n",
    );
    const msgs = [];
    for await (const msg of SSE.consume(resp)) msgs.push(msg);
    expect(msgs).toEqual([
      { id: "abc", data: "myid", event: "stream-id" },
      { id: "1", data: "chunk", event: "" },
    ]);
  });

  it("handles multi-line data", async () => {
    const resp = makeResponse("id: 1\ndata: line1\ndata: line2\n\n");
    const msgs = [];
    for await (const msg of SSE.consume(resp)) msgs.push(msg);
    expect(msgs).toEqual([{ id: "1", data: "line1\nline2", event: "" }]);
  });

  it("handles chunked delivery (split across reads)", async () => {
    const resp = makeChunkedResponse([
      "id: 1\nda",
      "ta: hello\n\nid: 2\n",
      "data: world\n\n",
    ]);
    const msgs = [];
    for await (const msg of SSE.consume(resp)) msgs.push(msg);
    expect(msgs).toEqual([
      { id: "1", data: "hello", event: "" },
      { id: "2", data: "world", event: "" },
    ]);
  });

  it("round-trips with SSE.format", async () => {
    const raw =
      SSE.format("s1", "hello", "stream-id") +
      SSE.format(1, "chunk1") +
      SSE.format(2, "multi\nline") +
      SSE.formatEvent("done");

    const resp = makeResponse(raw);
    const msgs = [];
    for await (const msg of SSE.consume(resp)) msgs.push(msg);

    expect(msgs).toEqual([
      { id: "s1", data: "hello", event: "stream-id" },
      { id: "1", data: "chunk1", event: "" },
      { id: "2", data: "multi\nline", event: "" },
      { id: "", data: "", event: "done" },
    ]);
  });

  it("handles terminal event with data", async () => {
    const raw = SSE.formatEvent("error", "rate limited");
    const resp = makeResponse(raw);
    const msgs = [];
    for await (const msg of SSE.consume(resp)) msgs.push(msg);
    expect(msgs).toEqual([{ id: "", data: "rate limited", event: "error" }]);
  });
});
