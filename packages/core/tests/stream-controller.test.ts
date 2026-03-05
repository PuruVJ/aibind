import { describe, it, expect, vi, beforeEach } from "vitest";
import { StreamController, type StreamCallbacks } from "../src/stream-controller";
import { SSE } from "../src/sse";

// --- Helpers ---

function createCallbacks(): StreamCallbacks & {
  calls: Record<keyof StreamCallbacks, unknown[]>;
} {
  const calls: Record<string, unknown[]> = {
    onText: [],
    onLoading: [],
    onDone: [],
    onError: [],
    onStatus: [],
    onStreamId: [],
    onCanResume: [],
  };
  return {
    calls: calls as Record<keyof StreamCallbacks, unknown[]>,
    onText: (v) => calls.onText.push(v),
    onLoading: (v) => calls.onLoading.push(v),
    onDone: (v) => calls.onDone.push(v),
    onError: (v) => calls.onError.push(v),
    onStatus: (v) => calls.onStatus.push(v),
    onStreamId: (v) => calls.onStreamId.push(v),
    onCanResume: (v) => calls.onCanResume.push(v),
  };
}

/** Create a mock plain-text streaming Response. */
function createTextResponse(chunks: string[], status = 200): Response {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    statusText: status === 200 ? "OK" : "Error",
  });
}

/** Create a mock SSE streaming Response. */
function createSSEResponse(
  events: Array<{ id?: string | number; data: string; event?: string }>,
  streamId?: string,
): Response {
  let body = "";
  for (const evt of events) {
    if (evt.event && !evt.id) {
      body += SSE.formatEvent(evt.event, evt.data);
    } else {
      body += SSE.format(evt.id ?? 0, evt.data, evt.event);
    }
  }
  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream",
  };
  if (streamId) headers["X-Stream-Id"] = streamId;

  return new Response(body, { status: 200, headers });
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// --- Tests ---

describe("StreamController", () => {
  let cb: ReturnType<typeof createCallbacks>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cb = createCallbacks();
    fetchMock = vi.fn();
    vi.clearAllMocks();
  });

  // --- Constructor ---

  describe("constructor", () => {
    it("throws if endpoint is missing", () => {
      expect(
        () => new StreamController({ endpoint: "" }, cb),
      ).toThrow("endpoint");
    });

    it("creates with valid endpoint", () => {
      const ctrl = new StreamController({ endpoint: "/api/stream" }, cb);
      expect(ctrl).toBeInstanceOf(StreamController);
    });
  });

  // --- Plain text streaming ---

  describe("send() — plain text", () => {
    it("streams text chunks and calls callbacks in order", async () => {
      fetchMock.mockResolvedValue(createTextResponse(["Hello", " world"]));

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hi");
      await flushPromises();

      // Verify fetch was called with correct body
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/stream",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ prompt: "hi", system: undefined, model: undefined }),
        }),
      );

      // Text accumulated correctly
      expect(cb.calls.onText).toContain("Hello");
      expect(cb.calls.onText).toContain("Hello world");

      // Status transitions: streaming → done
      expect(cb.calls.onStatus).toContain("streaming");
      expect(cb.calls.onStatus).toContain("done");

      // Loading: true → false
      expect(cb.calls.onLoading[0]).toBe(true);
      expect(cb.calls.onLoading[cb.calls.onLoading.length - 1]).toBe(false);

      // Done called
      expect(cb.calls.onDone).toContain(true);
    });

    it("includes model and system in request body", async () => {
      fetchMock.mockResolvedValue(createTextResponse(["ok"]));

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock, model: "gpt-4", system: "Be helpful" },
        cb,
      );
      ctrl.send("hello");
      await flushPromises();

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.model).toBe("gpt-4");
      expect(body.system).toBe("Be helpful");
    });

    it("per-send system prompt overrides constructor system", async () => {
      fetchMock.mockResolvedValue(createTextResponse(["ok"]));

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock, system: "default" },
        cb,
      );
      ctrl.send("hello", { system: "override" });
      await flushPromises();

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.system).toBe("override");
    });

    it("resets state on each send", async () => {
      fetchMock
        .mockResolvedValueOnce(createTextResponse(["first"]))
        .mockResolvedValueOnce(createTextResponse(["second"]));

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );

      ctrl.send("a");
      await flushPromises();

      // Text was reset then accumulated fresh
      cb.calls.onText.length = 0;
      ctrl.send("b");
      await flushPromises();

      expect(cb.calls.onText).toContain("");       // reset
      expect(cb.calls.onText).toContain("second"); // new text
    });

    it("calls onFinish callback with final text", async () => {
      const onFinish = vi.fn();
      fetchMock.mockResolvedValue(createTextResponse(["Hello", " world"]));

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock, onFinish },
        cb,
      );
      ctrl.send("hi");
      await flushPromises();

      expect(onFinish).toHaveBeenCalledWith("Hello world");
    });

    it("getter returns accumulated text", async () => {
      fetchMock.mockResolvedValue(createTextResponse(["abc"]));

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("go");
      await flushPromises();

      expect(ctrl.text).toBe("abc");
    });
  });

  // --- Error handling ---

  describe("error handling", () => {
    it("handles HTTP error response", async () => {
      fetchMock.mockResolvedValue(new Response("", { status: 500 }));

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hi");
      await flushPromises();

      expect(cb.calls.onStatus).toContain("error");
      const errors = cb.calls.onError.filter((e) => e !== null);
      expect(errors.length).toBeGreaterThan(0);
      expect((errors[0] as Error).message).toMatch(/500/);
    });

    it("handles network error", async () => {
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hi");
      await flushPromises();

      expect(cb.calls.onStatus).toContain("error");
      const errors = cb.calls.onError.filter((e) => e !== null);
      expect((errors[0] as Error).message).toBe("Failed to fetch");
    });

    it("calls onError option callback on error", async () => {
      const onError = vi.fn();
      fetchMock.mockRejectedValue(new Error("oops"));

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock, onError },
        cb,
      );
      ctrl.send("hi");
      await flushPromises();

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it("converts non-Error throwables to Error", async () => {
      fetchMock.mockRejectedValue("string error");

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hi");
      await flushPromises();

      const errors = cb.calls.onError.filter((e) => e !== null);
      expect(errors[0]).toBeInstanceOf(Error);
      expect((errors[0] as Error).message).toBe("string error");
    });
  });

  // --- abort ---

  describe("abort()", () => {
    it("aborts the active stream", async () => {
      // Use a slow stream
      let resolve: (() => void) | null = null;
      const hangingPromise = new Promise<Response>((r) => {
        resolve = () => r(createTextResponse(["done"]));
      });
      fetchMock.mockReturnValue(hangingPromise);

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hi");
      await flushPromises();

      ctrl.abort();

      // Status should go back to idle
      expect(cb.calls.onStatus).toContain("idle");
      expect(cb.calls.onCanResume).toContain(false);

      // Clean up
      resolve!();
    });

    it("is a no-op when idle", () => {
      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.abort();
      // No status change since already idle
      expect(cb.calls.onStatus).toEqual([]);
    });
  });

  // --- retry ---

  describe("retry()", () => {
    it("resends the last prompt", async () => {
      fetchMock
        .mockResolvedValueOnce(createTextResponse(["first"]))
        .mockResolvedValueOnce(createTextResponse(["second"]));

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hello");
      await flushPromises();

      ctrl.retry();
      await flushPromises();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      // Both calls should have same prompt
      const body1 = JSON.parse(fetchMock.mock.calls[0][1].body);
      const body2 = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(body1.prompt).toBe(body2.prompt);
    });

    it("is a no-op if never sent", async () => {
      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.retry();
      await flushPromises();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // --- SSE mode ---

  describe("SSE mode", () => {
    it("detects SSE from Content-Type and processes events", async () => {
      fetchMock.mockResolvedValue(
        createSSEResponse(
          [
            { event: "stream-id", data: "sid-123", id: 0 },
            { id: 1, data: "Hello" },
            { id: 2, data: " world" },
            { event: "done", data: "" },
          ],
          "sid-123",
        ),
      );

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hi");
      await flushPromises();

      expect(cb.calls.onStreamId).toContain("sid-123");
      expect(cb.calls.onText).toContain("Hello");
      expect(cb.calls.onText).toContain("Hello world");
      expect(cb.calls.onStatus).toContain("done");
    });

    it("handles SSE error event", async () => {
      fetchMock.mockResolvedValue(
        createSSEResponse([
          { event: "error", data: "Something went wrong" },
        ]),
      );

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hi");
      await flushPromises();

      expect(cb.calls.onStatus).toContain("error");
      const errors = cb.calls.onError.filter((e) => e !== null);
      expect((errors[0] as Error).message).toBe("Something went wrong");
    });

    it("handles SSE stopped event", async () => {
      fetchMock.mockResolvedValue(
        createSSEResponse([
          { event: "stream-id", data: "sid-1", id: 0 },
          { id: 1, data: "partial" },
          { event: "stopped", data: "" },
        ]),
      );

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hi");
      await flushPromises();

      expect(cb.calls.onStatus).toContain("stopped");
    });

    it("tracks sequence numbers from SSE ids", async () => {
      fetchMock.mockResolvedValue(
        createSSEResponse([
          { event: "stream-id", data: "sid-1", id: 0 },
          { id: 5, data: "chunk" },
          { event: "done", data: "" },
        ]),
      );

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hi");
      await flushPromises();

      // The lastSeq is tracked internally for resume
      expect(cb.calls.onStatus).toContain("done");
    });
  });

  // --- stop ---

  describe("stop()", () => {
    it("falls back to abort when not in SSE mode", async () => {
      fetchMock.mockResolvedValue(createTextResponse(["chunk"]));

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hi");
      await flushPromises();

      // Reset calls to track stop behavior
      fetchMock.mockClear();
      await ctrl.stop();

      // Should NOT call stop endpoint since not SSE
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends stop request for SSE streams", async () => {
      // Create a hanging SSE stream
      let resolveStream: (() => void) | null = null;
      const encoder = new TextEncoder();
      const sseBody =
        SSE.format(0, "sid-1", "stream-id") + SSE.format(1, "hello");

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseBody));
          // Don't close — simulates ongoing stream
          resolveStream = () => controller.close();
        },
      });

      fetchMock
        .mockResolvedValueOnce(
          new Response(stream, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream",
              "X-Stream-Id": "sid-1",
            },
          }),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hi");
      await flushPromises();

      await ctrl.stop();

      // Should have called stop endpoint
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/stream/stop",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ id: "sid-1" }),
        }),
      );

      expect(cb.calls.onStatus).toContain("stopped");
      resolveStream!();
    });
  });

  // --- resume ---

  describe("resume()", () => {
    it("is a no-op when not in SSE mode", async () => {
      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      await ctrl.resume();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // --- concurrent sends ---

  describe("concurrent sends", () => {
    it("aborts previous stream when sending again", async () => {
      let resolveFirst: (() => void) | null = null;
      const firstPromise = new Promise<Response>((r) => {
        resolveFirst = () => r(createTextResponse(["first"]));
      });

      fetchMock
        .mockReturnValueOnce(firstPromise)
        .mockResolvedValueOnce(createTextResponse(["second"]));

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );

      ctrl.send("first prompt");
      ctrl.send("second prompt"); // Should abort first
      await flushPromises();

      // Both fetch calls made
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Clean up
      resolveFirst!();
    });
  });

  // --- SSE reconnection ---

  describe("SSE reconnection", () => {
    it("auto-reconnects when SSE connection drops without done event", async () => {
      // First response: SSE stream that ends abruptly (no "done" event)
      const abruptSSE =
        SSE.format(0, "sid-1", "stream-id") + SSE.format(1, "partial");

      // Second response (resume): completes the stream
      const resumeSSE =
        SSE.format(2, " complete") + SSE.formatEvent("done");

      fetchMock
        .mockResolvedValueOnce(
          new Response(abruptSSE, {
            status: 200,
            headers: { "Content-Type": "text/event-stream", "X-Stream-Id": "sid-1" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(resumeSSE, {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          }),
        );

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hi");

      // Wait enough for reconnect (1s backoff + processing)
      await new Promise((r) => setTimeout(r, 1500));

      expect(cb.calls.onStatus).toContain("reconnecting");
      expect(cb.calls.onStatus).toContain("streaming"); // back to streaming after reconnect
      expect(cb.calls.onStatus).toContain("done");

      // Should have called resume endpoint
      const resumeCall = fetchMock.mock.calls[1];
      expect(resumeCall[0]).toContain("/resume");
      expect(resumeCall[0]).toContain("id=sid-1");
      expect(resumeCall[0]).toContain("after=1");
    });

    it("exhausts retries and sets disconnected with canResume", async () => {
      // SSE stream that drops
      const abruptSSE = SSE.format(0, "sid-1", "stream-id") + SSE.format(1, "data");

      fetchMock
        .mockResolvedValueOnce(
          new Response(abruptSSE, {
            status: 200,
            headers: { "Content-Type": "text/event-stream", "X-Stream-Id": "sid-1" },
          }),
        )
        // All 3 reconnect attempts fail
        .mockRejectedValueOnce(new Error("network down"))
        .mockRejectedValueOnce(new Error("network down"))
        .mockRejectedValueOnce(new Error("network down"));

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hi");

      // Wait for all 3 retries (1s + 2s + 4s = 7s, plus buffer)
      await new Promise((r) => setTimeout(r, 8000));

      expect(cb.calls.onStatus).toContain("disconnected");
      expect(cb.calls.onCanResume).toContain(true);
    }, 10000);

    it("resume sets reconnecting status and calls reconnect", async () => {
      // Need to get into a state where resume() works — use SSE and then stop
      const sseBody =
        SSE.format(0, "sid-1", "stream-id") +
        SSE.format(1, "hello") +
        SSE.formatEvent("stopped");

      // Resume response
      const resumeSSE = SSE.format(2, " world") + SSE.formatEvent("done");

      fetchMock
        .mockResolvedValueOnce(
          new Response(sseBody, {
            status: 200,
            headers: { "Content-Type": "text/event-stream", "X-Stream-Id": "sid-1" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(resumeSSE, {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          }),
        );

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hi");
      await flushPromises();

      // Should be stopped
      expect(cb.calls.onStatus).toContain("stopped");

      // Resume
      await ctrl.resume();

      // Wait for reconnect backoff
      await new Promise((r) => setTimeout(r, 1500));

      expect(cb.calls.onStatus).toContain("reconnecting");
    });
  });

  // --- SSE finalize error ---

  describe("SSE finalize error", () => {
    it("handles error thrown during finalize in SSE done event", async () => {
      const onFinish = vi.fn(() => {
        throw new Error("finalize crash");
      });

      fetchMock.mockResolvedValue(
        createSSEResponse([
          { id: 1, data: "hello" },
          { event: "done", data: "" },
        ]),
      );

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock, onFinish },
        cb,
      );
      ctrl.send("hi");
      await flushPromises();

      expect(cb.calls.onStatus).toContain("error");
      const errors = cb.calls.onError.filter((e) => e !== null);
      expect((errors[0] as Error).message).toBe("finalize crash");
    });
  });

  // --- abort edge cases ---

  describe("abort edge cases", () => {
    it("abort during reconnecting resets to idle", async () => {
      const abruptSSE = SSE.format(0, "sid-1", "stream-id") + SSE.format(1, "data");

      // Mock a slow reconnect
      let resolveReconnect: (() => void) | null = null;
      fetchMock.mockResolvedValueOnce(
        new Response(abruptSSE, {
          status: 200,
          headers: { "Content-Type": "text/event-stream", "X-Stream-Id": "sid-1" },
        }),
      );
      fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => {
        resolveReconnect = () => r(createTextResponse(["done"]));
      }));

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hi");

      // Wait for reconnect to start
      await new Promise((r) => setTimeout(r, 1200));

      // Abort during reconnecting
      ctrl.abort();

      expect(cb.calls.onStatus).toContain("idle");
      resolveReconnect?.();
    });

    it("AbortError during stopped status does not set done", async () => {
      const encoder = new TextEncoder();
      const sseBody =
        SSE.format(0, "sid-1", "stream-id") + SSE.format(1, "hello");

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseBody));
          // Don't close — ongoing stream
        },
      });

      fetchMock
        .mockResolvedValueOnce(
          new Response(stream, {
            status: 200,
            headers: { "Content-Type": "text/event-stream", "X-Stream-Id": "sid-1" },
          }),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hi");
      await flushPromises();

      await ctrl.stop();

      // Status should be stopped, NOT done
      const lastStatus = cb.calls.onStatus[cb.calls.onStatus.length - 1];
      expect(lastStatus).toBe("stopped");
      expect(cb.calls.onDone.filter(Boolean)).toEqual([]); // done never set to true
    });
  });

  // --- stop edge cases ---

  describe("stop edge cases", () => {
    it("falls back gracefully when stop request fails", async () => {
      const encoder = new TextEncoder();
      const sseBody =
        SSE.format(0, "sid-1", "stream-id") + SSE.format(1, "hello");

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseBody));
        },
      });

      fetchMock
        .mockResolvedValueOnce(
          new Response(stream, {
            status: 200,
            headers: { "Content-Type": "text/event-stream", "X-Stream-Id": "sid-1" },
          }),
        )
        .mockRejectedValueOnce(new Error("stop endpoint unreachable"));

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hi");
      await flushPromises();

      // stop() should not throw even if stop request fails
      await expect(ctrl.stop()).resolves.not.toThrow();
      expect(cb.calls.onStatus).toContain("stopped");
    });

    it("stop with no streamId behaves like abort", async () => {
      fetchMock.mockResolvedValue(createTextResponse(["data"]));

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hi");
      await flushPromises();

      fetchMock.mockClear();
      await ctrl.stop();

      // No fetch call to /stop endpoint
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // --- retry edge cases ---

  describe("retry edge cases", () => {
    it("retry preserves SendOptions from original call", async () => {
      fetchMock
        .mockResolvedValueOnce(createTextResponse(["first"]))
        .mockResolvedValueOnce(createTextResponse(["second"]));

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hello", { system: "custom system" });
      await flushPromises();

      ctrl.retry();
      await flushPromises();

      const body1 = JSON.parse(fetchMock.mock.calls[0][1].body);
      const body2 = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(body2.system).toBe("custom system");
      expect(body1.system).toBe(body2.system);
    });
  });

  // --- edge cases ---

  describe("edge cases", () => {
    it("handles empty response body", async () => {
      fetchMock.mockResolvedValue(createTextResponse([]));

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hi");
      await flushPromises();

      expect(ctrl.text).toBe("");
      expect(cb.calls.onStatus).toContain("done");
    });

    it("uses globalThis.fetch when no custom fetch provided", () => {
      const ctrl = new StreamController({ endpoint: "/api/stream" }, cb);
      expect(ctrl).toBeInstanceOf(StreamController);
    });

    it("reads X-Stream-Id from response header", async () => {
      fetchMock.mockResolvedValue(
        createSSEResponse(
          [
            { id: 1, data: "hello" },
            { event: "done", data: "" },
          ],
          "header-sid",
        ),
      );

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hi");
      await flushPromises();

      expect(cb.calls.onStreamId).toContain("header-sid");
    });

    it("handles many small chunks", async () => {
      const chunks = Array.from({ length: 100 }, (_, i) => String(i));
      fetchMock.mockResolvedValue(createTextResponse(chunks));

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("hi");
      await flushPromises();

      const expected = chunks.join("");
      expect(ctrl.text).toBe(expected);
    });

    it("send() resets streamId, isSSE, and reconnect state", async () => {
      // First send: SSE
      fetchMock.mockResolvedValueOnce(
        createSSEResponse([
          { event: "stream-id", data: "sid-1", id: 0 },
          { id: 1, data: "first" },
          { event: "done", data: "" },
        ]),
      );

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
      ctrl.send("first");
      await flushPromises();

      expect(cb.calls.onStreamId).toContain("sid-1");

      // Second send: plain text (resets SSE state)
      fetchMock.mockResolvedValueOnce(createTextResponse(["second"]));
      ctrl.send("second");
      await flushPromises();

      // streamId should be reset to null before second send
      expect(cb.calls.onStreamId).toContain(null);
      expect(cb.calls.onCanResume).toContain(false);
    });
  });
});
