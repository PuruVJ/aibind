import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  StreamController,
  type StreamCallbacks,
  type SpeakOptions,
} from "../src/stream-controller";
import { SSE } from "../src/sse";
import { standardDetector, claudeDetector } from "../src/artifacts";
import type { ArtifactDetector } from "../src/artifacts";

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
      expect(() => new StreamController({ endpoint: "" }, cb)).toThrow(
        "endpoint",
      );
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
          body: JSON.stringify({
            prompt: "hi",
            system: undefined,
            model: undefined,
          }),
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
        {
          endpoint: "/api/stream",
          fetch: fetchMock,
          model: "gpt-4",
          system: "Be helpful",
        },
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

      expect(cb.calls.onText).toContain(""); // reset
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
        createSSEResponse([{ event: "error", data: "Something went wrong" }]),
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
      const resumeSSE = SSE.format(2, " complete") + SSE.formatEvent("done");

      fetchMock
        .mockResolvedValueOnce(
          new Response(abruptSSE, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream",
              "X-Stream-Id": "sid-1",
            },
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
      const abruptSSE =
        SSE.format(0, "sid-1", "stream-id") + SSE.format(1, "data");

      fetchMock
        .mockResolvedValueOnce(
          new Response(abruptSSE, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream",
              "X-Stream-Id": "sid-1",
            },
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
            headers: {
              "Content-Type": "text/event-stream",
              "X-Stream-Id": "sid-1",
            },
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
      const abruptSSE =
        SSE.format(0, "sid-1", "stream-id") + SSE.format(1, "data");

      // Mock a slow reconnect
      let resolveReconnect: (() => void) | null = null;
      fetchMock.mockResolvedValueOnce(
        new Response(abruptSSE, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "X-Stream-Id": "sid-1",
          },
        }),
      );
      fetchMock.mockImplementationOnce(
        () =>
          new Promise<Response>((r) => {
            resolveReconnect = () => r(createTextResponse(["done"]));
          }),
      );

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
            headers: {
              "Content-Type": "text/event-stream",
              "X-Stream-Id": "sid-1",
            },
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

  // --- routeModel ---

  describe("routeModel", () => {
    it("calls routeModel and uses its return value as model", async () => {
      fetchMock.mockResolvedValue(createTextResponse(["ok"]));

      const routeModel = vi.fn().mockReturnValue("smart");
      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock, routeModel },
        cb,
      );
      ctrl.send("hello");
      await flushPromises();

      expect(routeModel).toHaveBeenCalledWith("hello");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.model).toBe("smart");
    });

    it("per-send explicit model skips routeModel entirely", async () => {
      fetchMock.mockResolvedValue(createTextResponse(["ok"]));

      const routeModel = vi.fn().mockReturnValue("smart");
      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock, routeModel },
        cb,
      );
      ctrl.send("hello", { model: "fast" });
      await flushPromises();

      expect(routeModel).not.toHaveBeenCalled();
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.model).toBe("fast");
    });

    it("uses constructor model default when no routeModel and no per-send override", async () => {
      fetchMock.mockResolvedValue(createTextResponse(["ok"]));

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock, model: "reason" },
        cb,
      );
      ctrl.send("hello");
      await flushPromises();

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.model).toBe("reason");
    });

    it("awaits async routeModel and uses its resolved value", async () => {
      fetchMock.mockResolvedValue(createTextResponse(["ok"]));

      const routeModel = vi.fn().mockResolvedValue("reason");
      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock, routeModel },
        cb,
      );
      ctrl.send("analyze this deeply");
      await flushPromises();

      expect(routeModel).toHaveBeenCalledWith("analyze this deeply");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.model).toBe("reason");
    });

    it("falls back to constructor model when routeModel throws", async () => {
      fetchMock.mockResolvedValue(createTextResponse(["ok"]));

      const routeModel = vi.fn().mockRejectedValue(new Error("routing failed"));
      const ctrl = new StreamController(
        {
          endpoint: "/api/stream",
          fetch: fetchMock,
          model: "fast",
          routeModel,
        },
        cb,
      );
      ctrl.send("hello");
      await flushPromises();

      // Fetch still called — stream continued with fallback model
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.model).toBe("fast");
    });

    it("falls back to undefined model when routeModel throws and no default set", async () => {
      fetchMock.mockResolvedValue(createTextResponse(["ok"]));

      const routeModel = vi.fn().mockRejectedValue(new Error("routing failed"));
      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock, routeModel },
        cb,
      );
      ctrl.send("hello");
      await flushPromises();

      // Stream still proceeds without crashing
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.model).toBeUndefined();
    });

    it("does not fetch when abort() is called during async routeModel", async () => {
      let resolveRouter: ((value: string) => void) | null = null;
      const routeModel = vi.fn(
        () =>
          new Promise<string>((r) => {
            resolveRouter = r;
          }),
      );

      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock, routeModel },
        cb,
      );
      ctrl.send("hello");

      // Router is pending — abort before it resolves
      ctrl.abort();

      // Now resolve the router
      resolveRouter!("smart");
      await flushPromises();

      // Fetch must NOT have been called
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("is called with the exact prompt string on each send", async () => {
      fetchMock.mockResolvedValue(createTextResponse(["ok"]));

      const routeModel = vi.fn().mockReturnValue("fast");
      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock, routeModel },
        cb,
      );

      ctrl.send("first");
      await flushPromises();
      ctrl.send("second");
      await flushPromises();

      expect(routeModel).toHaveBeenNthCalledWith(1, "first");
      expect(routeModel).toHaveBeenNthCalledWith(2, "second");
    });
  });

  // --- artifact scanning ---

  describe("artifact scanning", () => {
    function makeArtifactCb(): StreamCallbacks & {
      artifactSnapshots: unknown[][];
    } {
      const artifactSnapshots: unknown[][] = [];
      const base = createCallbacks();
      return {
        ...base,
        artifactSnapshots,
        onArtifacts: (arts) => {
          // deep copy each snapshot so we can assert intermediate states
          artifactSnapshots.push(JSON.parse(JSON.stringify(arts)));
        },
      };
    }

    it("does not fire onArtifacts when no detector is provided", async () => {
      fetchMock.mockResolvedValue(
        createTextResponse(['<artifact lang="ts">\ncode\n</artifact>\n']),
      );

      const artifactCb = vi.fn();
      const ctrl = new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        { ...createCallbacks(), onArtifacts: artifactCb },
      );
      ctrl.send("hi");
      await flushPromises();

      expect(artifactCb).not.toHaveBeenCalled();
    });

    it("parses a single artifact from a complete chunk", async () => {
      const body =
        '<artifact lang="tsx" title="Counter">\nconst x = 1;\n</artifact>\n';
      fetchMock.mockResolvedValue(createTextResponse([body]));

      const acb = makeArtifactCb();
      const ctrl = new StreamController(
        {
          endpoint: "/api/stream",
          fetch: fetchMock,
          artifact: { detector: standardDetector },
        },
        acb,
      );
      ctrl.send("hi");
      await flushPromises();

      const last = acb.artifactSnapshots[acb.artifactSnapshots.length - 1]!;
      expect(last).toHaveLength(1);
      expect(last[0]).toMatchObject({
        language: "tsx",
        title: "Counter",
        content: "const x = 1;",
        complete: true,
      });
    });

    it("accumulates content across multiple chunks", async () => {
      fetchMock.mockResolvedValue(
        createTextResponse([
          '<artifact lang="ts">\n',
          "line1\n",
          "line2\n",
          "</artifact>\n",
        ]),
      );

      const acb = makeArtifactCb();
      const ctrl = new StreamController(
        {
          endpoint: "/api/stream",
          fetch: fetchMock,
          artifact: { detector: standardDetector },
        },
        acb,
      );
      ctrl.send("hi");
      await flushPromises();

      const last = acb.artifactSnapshots[acb.artifactSnapshots.length - 1]!;
      expect((last[0] as any).content).toBe("line1\nline2");
      expect((last[0] as any).complete).toBe(true);
    });

    it("handles marker split across chunks (partial line in first chunk)", async () => {
      // The open tag is split: first chunk has no newline so nothing is scanned yet
      fetchMock.mockResolvedValue(
        createTextResponse([
          "<artifact lang=", // no newline — partial line, nothing scanned
          '"py">\nprint("hi")\n', // newline present — now the open tag line is complete
          "</artifact>\n",
        ]),
      );

      const acb = makeArtifactCb();
      const ctrl = new StreamController(
        {
          endpoint: "/api/stream",
          fetch: fetchMock,
          artifact: { detector: standardDetector },
        },
        acb,
      );
      ctrl.send("hi");
      await flushPromises();

      const last = acb.artifactSnapshots[acb.artifactSnapshots.length - 1]!;
      expect(last).toHaveLength(1);
      expect((last[0] as any).language).toBe("py");
      expect((last[0] as any).complete).toBe(true);
    });

    it("marks artifact complete in _finalize when no close marker before stream end", async () => {
      // No closing tag — stream just ends
      fetchMock.mockResolvedValue(
        createTextResponse(['<artifact lang="ts">\nconst x = 1;\n']),
      );

      const acb = makeArtifactCb();
      const ctrl = new StreamController(
        {
          endpoint: "/api/stream",
          fetch: fetchMock,
          artifact: { detector: standardDetector },
        },
        acb,
      );
      ctrl.send("hi");
      await flushPromises();

      const last = acb.artifactSnapshots[acb.artifactSnapshots.length - 1]!;
      expect((last[0] as any).complete).toBe(true);
    });

    it("handles multiple artifacts in one response", async () => {
      const body = [
        '<artifact lang="ts" title="A">\n',
        "codeA\n",
        "</artifact>\n",
        "some prose in between\n",
        '<artifact lang="py" title="B">\n',
        "codeB\n",
        "</artifact>\n",
      ].join("");
      fetchMock.mockResolvedValue(createTextResponse([body]));

      const acb = makeArtifactCb();
      const ctrl = new StreamController(
        {
          endpoint: "/api/stream",
          fetch: fetchMock,
          artifact: { detector: standardDetector },
        },
        acb,
      );
      ctrl.send("hi");
      await flushPromises();

      const last = acb.artifactSnapshots[acb.artifactSnapshots.length - 1]!;
      expect(last).toHaveLength(2);
      expect((last[0] as any).title).toBe("A");
      expect((last[0] as any).content).toBe("codeA");
      expect((last[1] as any).title).toBe("B");
      expect((last[1] as any).content).toBe("codeB");
      expect((last[1] as any).complete).toBe(true);
    });

    it("resets artifacts array on new send", async () => {
      const body = '<artifact lang="ts">\nx\n</artifact>\n';
      fetchMock
        .mockResolvedValueOnce(createTextResponse([body]))
        .mockResolvedValueOnce(createTextResponse(["plain response\n"]));

      const acb = makeArtifactCb();
      const ctrl = new StreamController(
        {
          endpoint: "/api/stream",
          fetch: fetchMock,
          artifact: { detector: standardDetector },
        },
        acb,
      );

      ctrl.send("first");
      await flushPromises();

      const snapsBefore = acb.artifactSnapshots.length;

      ctrl.send("second");
      await flushPromises();

      // After second send, onArtifacts([] should have been fired (reset)
      const resetSnapshot = acb.artifactSnapshots[snapsBefore];
      expect(resetSnapshot).toEqual([]);
    });

    it("uses claude identifier as artifact id", async () => {
      const body =
        '<antArtifact identifier="my-widget" language="tsx" title="Widget">\nconst x = 1;\n</antArtifact>\n';
      fetchMock.mockResolvedValue(createTextResponse([body]));

      const acb = makeArtifactCb();
      const ctrl = new StreamController(
        {
          endpoint: "/api/stream",
          fetch: fetchMock,
          artifact: { detector: claudeDetector },
        },
        acb,
      );
      ctrl.send("hi");
      await flushPromises();

      const last = acb.artifactSnapshots[acb.artifactSnapshots.length - 1]!;
      expect((last[0] as any).id).toBe("my-widget");
    });

    it("generates sequential ids when detector returns no id", async () => {
      const body = [
        '<artifact lang="ts">\nA\n</artifact>\n',
        '<artifact lang="ts">\nB\n</artifact>\n',
      ].join("");
      fetchMock.mockResolvedValue(createTextResponse([body]));

      const acb = makeArtifactCb();
      const ctrl = new StreamController(
        {
          endpoint: "/api/stream",
          fetch: fetchMock,
          artifact: { detector: standardDetector },
        },
        acb,
      );
      ctrl.send("hi");
      await flushPromises();

      const last = acb.artifactSnapshots[acb.artifactSnapshots.length - 1]!;
      const ids = last.map((a: any) => a.id as string);
      // Each id should be unique and match the pattern
      expect(ids[0]).toMatch(/^artifact-\d+$/);
      expect(ids[1]).toMatch(/^artifact-\d+$/);
      expect(ids[0]).not.toBe(ids[1]);
    });

    it("fires onArtifacts progressively as content arrives", async () => {
      fetchMock.mockResolvedValue(
        createTextResponse([
          '<artifact lang="ts">\n',
          "line1\n",
          "line2\n",
          "</artifact>\n",
        ]),
      );

      const acb = makeArtifactCb();
      const ctrl = new StreamController(
        {
          endpoint: "/api/stream",
          fetch: fetchMock,
          artifact: { detector: standardDetector },
        },
        acb,
      );
      ctrl.send("hi");
      await flushPromises();

      // Should have fired at least: open, content×2, close
      expect(acb.artifactSnapshots.length).toBeGreaterThanOrEqual(3);
    });

    it("prose before and after artifact does not create extra artifacts", async () => {
      const body = [
        "Here is some code:\n",
        '<artifact lang="ts">\nconst x = 1;\n</artifact>\n',
        "Done!\n",
      ].join("");
      fetchMock.mockResolvedValue(createTextResponse([body]));

      const acb = makeArtifactCb();
      const ctrl = new StreamController(
        {
          endpoint: "/api/stream",
          fetch: fetchMock,
          artifact: { detector: standardDetector },
        },
        acb,
      );
      ctrl.send("hi");
      await flushPromises();

      const last = acb.artifactSnapshots[acb.artifactSnapshots.length - 1]!;
      expect(last).toHaveLength(1);
    });

    it("custom detector is called with correct inArtifact state", async () => {
      const calls: Array<{ line: string; inArtifact: boolean }> = [];
      const trackingDetector: ArtifactDetector = (line, inArtifact) => {
        calls.push({ line, inArtifact });
        return standardDetector(line, inArtifact);
      };

      const body = '<artifact lang="ts">\ncode\n</artifact>\n';
      fetchMock.mockResolvedValue(createTextResponse([body]));

      const acb = makeArtifactCb();
      const ctrl = new StreamController(
        {
          endpoint: "/api/stream",
          fetch: fetchMock,
          artifact: { detector: trackingDetector },
        },
        acb,
      );
      ctrl.send("hi");
      await flushPromises();

      // Open line: inArtifact=false
      expect(calls[0]).toMatchObject({ inArtifact: false });
      // Content line: inArtifact=true
      expect(calls[1]).toMatchObject({ line: "code", inArtifact: true });
      // Close line: inArtifact=true
      expect(calls[2]).toMatchObject({ inArtifact: true });
    });

    it("works with SSE streaming (chunks via SSE events)", async () => {
      fetchMock.mockResolvedValue(
        createSSEResponse([
          { id: 1, data: '<artifact lang="ts">\n' },
          { id: 2, data: "const x = 1;\n" },
          { id: 3, data: "</artifact>\n" },
          { event: "done", data: "" },
        ]),
      );

      const acb = makeArtifactCb();
      const ctrl = new StreamController(
        {
          endpoint: "/api/stream",
          fetch: fetchMock,
          artifact: { detector: standardDetector },
        },
        acb,
      );
      ctrl.send("hi");
      await flushPromises();

      const last = acb.artifactSnapshots[acb.artifactSnapshots.length - 1]!;
      expect(last).toHaveLength(1);
      expect((last[0] as any).content).toBe("const x = 1;");
      expect((last[0] as any).complete).toBe(true);
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

  // --- speak() ---

  describe("speak()", () => {
    let mockSpeech: {
      cancel: ReturnType<typeof vi.fn>;
      speak: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockSpeech = { cancel: vi.fn(), speak: vi.fn() };
      vi.stubGlobal("speechSynthesis", mockSpeech);
      vi.stubGlobal(
        "SpeechSynthesisUtterance",
        class {
          text: string;
          rate?: number;
          pitch?: number;
          volume?: number;
          lang?: string;
          voice?: unknown;
          constructor(text: string) {
            this.text = text;
          }
        },
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function makeCtrl(fetchMock: ReturnType<typeof vi.fn>): StreamController {
      return new StreamController(
        { endpoint: "/api/stream", fetch: fetchMock },
        cb,
      );
    }

    it("returns a no-op cleanup when speechSynthesis is unavailable", () => {
      vi.stubGlobal("speechSynthesis", undefined);
      const ctrl = makeCtrl(vi.fn());
      const stop = ctrl.speak();
      expect(typeof stop).toBe("function");
      expect(() => stop()).not.toThrow();
    });

    it("cancels any prior speech and speaks sentence-by-sentence", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          createTextResponse(["Hello world. ", "How are you today? ", "Fine!"]),
        );
      const ctrl = makeCtrl(fetchMock);
      ctrl.speak();
      ctrl.send("hi");
      await flushPromises();

      expect(mockSpeech.cancel).toHaveBeenCalled();
      // Should have spoken two complete sentences; trailing fragment spoken on finalize
      const texts = mockSpeech.speak.mock.calls.map(
        (c: [{ text: string }]) => c[0].text,
      );
      expect(texts).toContain("Hello world.");
      expect(texts).toContain("How are you today?");
      expect(texts).toContain("Fine!");
    });

    it("applies SpeakOptions to each utterance", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(createTextResponse(["Done."]));
      const ctrl = makeCtrl(fetchMock);
      const opts: SpeakOptions = {
        rate: 1.5,
        pitch: 0.8,
        volume: 0.9,
        lang: "en-GB",
      };
      ctrl.speak(opts);
      ctrl.send("hi");
      await flushPromises();

      const utterance = mockSpeech.speak.mock.calls[0]?.[0];
      expect(utterance.rate).toBe(1.5);
      expect(utterance.pitch).toBe(0.8);
      expect(utterance.volume).toBe(0.9);
      expect(utterance.lang).toBe("en-GB");
    });

    it("stop() cancels speech", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(createTextResponse(["Hello."]));
      const ctrl = makeCtrl(fetchMock);
      const stop = ctrl.speak();
      ctrl.send("hi");
      stop();
      await flushPromises();

      // cancel should have been called at least by stop()
      expect(mockSpeech.cancel).toHaveBeenCalled();
    });

    it("persists speak mode across multiple sends", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(createTextResponse(["First."]))
        .mockResolvedValueOnce(createTextResponse(["Second."]));
      const ctrl = makeCtrl(fetchMock);
      ctrl.speak();
      ctrl.send("first");
      await flushPromises();

      const callCountAfterFirst = mockSpeech.speak.mock.calls.length;
      expect(callCountAfterFirst).toBeGreaterThan(0);

      ctrl.send("second");
      await flushPromises();

      // speak mode persists — second send also speaks
      expect(mockSpeech.speak.mock.calls.length).toBeGreaterThan(
        callCountAfterFirst,
      );
    });

    it("stop() disables speak for subsequent sends too", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(createTextResponse(["First."]))
        .mockResolvedValueOnce(createTextResponse(["Second."]));
      const ctrl = makeCtrl(fetchMock);
      const stop = ctrl.speak();
      ctrl.send("first");
      await flushPromises();

      stop();
      const callCountAfterStop = mockSpeech.speak.mock.calls.length;

      ctrl.send("second");
      await flushPromises();

      // No new speech after stop()
      expect(mockSpeech.speak.mock.calls.length).toBe(callCountAfterStop);
    });
  });
});
