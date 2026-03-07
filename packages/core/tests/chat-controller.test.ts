import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatController } from "../src/chat-controller";
import type { ChatCallbacks, BaseChatOptions } from "../src/types";

// --- Helpers ---

function createMockResponse(chunks: string[]): Response {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeCallbacks(): { callbacks: ChatCallbacks; onMessages: ReturnType<typeof vi.fn>; onLoading: ReturnType<typeof vi.fn>; onError: ReturnType<typeof vi.fn>; onStatus: ReturnType<typeof vi.fn> } {
  const onMessages = vi.fn();
  const onLoading = vi.fn();
  const onError = vi.fn();
  const onStatus = vi.fn();
  return {
    callbacks: { onMessages, onLoading, onError, onStatus },
    onMessages,
    onLoading,
    onError,
    onStatus,
  };
}

function makeOpts(fetch: typeof globalThis.fetch, extra?: Partial<BaseChatOptions>): BaseChatOptions {
  return { endpoint: "/api/chat", fetch, ...extra };
}

// --- Tests ---

describe("ChatController", () => {
  it("throws when endpoint is missing", () => {
    expect(() => new ChatController({ endpoint: "" }, makeCallbacks().callbacks)).toThrow(
      "@aibind: `endpoint` is required.",
    );
  });

  it("send() appends user and assistant messages immediately", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse([]));
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.send("Hello");
    await flushPromises();

    // First call: user + empty assistant
    const firstCall = onMessages.mock.calls[0][0];
    expect(firstCall).toHaveLength(2);
    expect(firstCall[0].role).toBe("user");
    expect(firstCall[0].content).toBe("Hello");
    expect(firstCall[1].role).toBe("assistant");
    expect(firstCall[1].content).toBe("");
  });

  it("streams chunks into the assistant message", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["Hello", " World"]));
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.send("Hi");
    await flushPromises();

    const lastCall = onMessages.mock.calls.at(-1)![0];
    const assistant = lastCall.find((m: { role: string }) => m.role === "assistant");
    expect(assistant.content).toBe("Hello World");
  });

  it("sets loading true then false", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["ok"]));
    const { callbacks, onLoading } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.send("test");
    expect(onLoading).toHaveBeenCalledWith(true);
    await flushPromises();
    expect(onLoading).toHaveBeenLastCalledWith(false);
  });

  it("fires onStatus streaming then done", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["hi"]));
    const { callbacks, onStatus } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.send("test");
    expect(onStatus).toHaveBeenCalledWith("streaming");
    await flushPromises();
    expect(onStatus).toHaveBeenLastCalledWith("done");
  });

  it("fires onError on non-ok response", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("Err", { status: 500 }));
    const { callbacks, onError, onStatus } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.send("test");
    await flushPromises();

    // onError(null) is fired at the start of send() to clear previous errors,
    // then onError(Error) is fired when the stream fails — two calls is correct.
    const errorCall = onError.mock.calls.find((c) => c[0] !== null);
    expect(errorCall).toBeDefined();
    expect(errorCall![0]).toBeInstanceOf(Error);
    expect(onStatus).toHaveBeenCalledWith("error");
  });

  it("clear() empties messages", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["ok"]));
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.send("test");
    await flushPromises();
    ctrl.clear();

    const lastCall = onMessages.mock.calls.at(-1)![0];
    expect(lastCall).toHaveLength(0);
  });

  it("regenerate() removes last assistant turn and re-sends the last user prompt", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(createMockResponse(["first"]))
      .mockResolvedValueOnce(createMockResponse(["second"]));
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.send("Prompt");
    await flushPromises();
    ctrl.regenerate();
    await flushPromises();

    // After regenerate: [user, assistant(second)]
    const lastMsgs = onMessages.mock.calls.at(-1)![0];
    expect(lastMsgs).toHaveLength(2);
    expect(lastMsgs[0].content).toBe("Prompt");
    expect(lastMsgs[1].content).toBe("second");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("edit() truncates from the edited message and re-sends", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(createMockResponse(["reply1"]))
      .mockResolvedValueOnce(createMockResponse(["reply2"]));
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.send("First");
    await flushPromises();

    // Get the ID of the first user message
    const firstMsgs = onMessages.mock.calls[0][0];
    const firstUserId = firstMsgs[0].id;

    ctrl.edit(firstUserId, "Edited");
    await flushPromises();

    const lastMsgs = onMessages.mock.calls.at(-1)![0];
    expect(lastMsgs).toHaveLength(2);
    expect(lastMsgs[0].content).toBe("Edited");
    expect(lastMsgs[1].content).toBe("reply2");
  });

  it("edit() with unknown id is a no-op", () => {
    const mockFetch = vi.fn();
    const { callbacks } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);
    expect(() => ctrl.edit("nonexistent", "text")).not.toThrow();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("send() ignores empty/whitespace-only content", () => {
    const mockFetch = vi.fn();
    const { callbacks, onLoading } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);
    ctrl.send("   ");
    expect(onLoading).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("messages payload sent to fetch excludes the empty assistant placeholder", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["ok"]));
    const { callbacks } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.send("My question");
    await flushPromises();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    // Payload should only have the user message (assistant placeholder excluded)
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe("user");
    expect(body.messages[0].content).toBe("My question");
    // IDs are stripped from payload
    expect(body.messages[0].id).toBeUndefined();
  });

  it("accumulates history across multiple turns", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(createMockResponse(["A"]))
      .mockResolvedValueOnce(createMockResponse(["B"]));
    const { callbacks } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.send("Turn 1");
    await flushPromises();
    ctrl.send("Turn 2");
    await flushPromises();

    const body2 = JSON.parse(mockFetch.mock.calls[1][1].body);
    // Second call should include [user1, assistant1, user2]
    expect(body2.messages).toHaveLength(3);
    expect(body2.messages[0].role).toBe("user");
    expect(body2.messages[1].role).toBe("assistant");
    expect(body2.messages[2].role).toBe("user");
  });

  it("calls onFinish with full messages after stream completes", async () => {
    const onFinish = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["done"]));
    const { callbacks } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch, { onFinish }), callbacks);

    ctrl.send("hi");
    await flushPromises();

    expect(onFinish).toHaveBeenCalledOnce();
    const msgs = onFinish.mock.calls[0][0];
    expect(msgs[1].content).toBe("done");
  });
});

// --- StreamHandler.chat ---

describe("StreamHandler.chat", () => {
  beforeEach(() => vi.resetModules());

  it("returns 400 when messages is missing", async () => {
    const { StreamHandler } = await import("../src/stream-handler");
    const handler = new StreamHandler({ model: "mock" as any });
    const res = await handler.chat({ messages: [], system: undefined, model: undefined });
    expect(res.status).toBe(400);
  });

  it("routes POST /__aibind__/chat via handle()", async () => {
    const { createStreamHandler } = await import("../src/stream-handler");
    // We're only testing routing; model resolution will fail without a real model
    const handler = createStreamHandler({ model: "mock" as any });
    const req = new Request("http://localhost/__aibind__/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });
    // Should not return 404 (routing works), may return 400 for bad model
    const res = await handler(req);
    expect(res.status).not.toBe(404);
  });
});
