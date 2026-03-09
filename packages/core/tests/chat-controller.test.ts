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

// --- optimistic() ---

describe("ChatController.optimistic()", () => {
  it("stages user+assistant messages immediately with optimistic=true", () => {
    const mockFetch = vi.fn();
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.optimistic("Hello");

    const msgs = onMessages.mock.calls.at(-1)![0];
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toBe("Hello");
    expect(msgs[0].optimistic).toBe(true);
    expect(msgs[1].role).toBe("assistant");
    expect(msgs[1].optimistic).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("send() starts streaming and clears optimistic flag on first chunk", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["Hi there"]));
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    const staged = ctrl.optimistic("Hello");
    staged.send();
    await flushPromises();

    expect(mockFetch).toHaveBeenCalledOnce();
    const lastMsgs = onMessages.mock.calls.at(-1)![0];
    expect(lastMsgs[0].optimistic).toBeFalsy();
    expect(lastMsgs[1].optimistic).toBeFalsy();
    expect(lastMsgs[1].content).toBe("Hi there");
  });

  it("cancel() removes the staged pair from messages", () => {
    const mockFetch = vi.fn();
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    const staged = ctrl.optimistic("Hello");
    // messages has 2 entries
    expect(onMessages.mock.calls.at(-1)![0]).toHaveLength(2);

    staged.cancel();

    expect(onMessages.mock.calls.at(-1)![0]).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("send() after cancel() is a no-op", async () => {
    const mockFetch = vi.fn();
    const { callbacks } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    const staged = ctrl.optimistic("Hello");
    staged.cancel();
    staged.send(); // should do nothing

    await flushPromises();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("cancel() after send() is a no-op", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["ok"]));
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    const staged = ctrl.optimistic("Hello");
    staged.send();
    staged.cancel(); // consumed — should not remove messages

    await flushPromises();
    expect(mockFetch).toHaveBeenCalledOnce();
    // Messages still present
    expect(onMessages.mock.calls.at(-1)![0]).toHaveLength(2);
  });

  it("empty/whitespace content returns a no-op handle", () => {
    const mockFetch = vi.fn();
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    const staged = ctrl.optimistic("   ");
    staged.send();
    staged.cancel();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(onMessages).not.toHaveBeenCalled();
  });

  it("calling optimistic() again discards the previous staged pair", () => {
    const mockFetch = vi.fn();
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.optimistic("First");
    ctrl.optimistic("Second");

    const msgs = onMessages.mock.calls.at(-1)![0];
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toBe("Second");
  });

  it("send() excludes optimistic flag in the fetch payload", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["ok"]));
    const { callbacks } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.optimistic("Hello").send();
    await flushPromises();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].optimistic).toBeUndefined();
  });

  it("calling send() while a staged message exists discards the staged pair first", () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse([]));
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.optimistic("Staged");
    ctrl.send("Direct");

    // Only the Direct pair should be present
    const msgs = onMessages.mock.calls.at(-1)![0];
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toBe("Direct");
  });

  it("staged send() preserves prior conversation history in the fetch payload", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(createMockResponse(["reply1"]))
      .mockResolvedValueOnce(createMockResponse(["reply2"]));
    const { callbacks } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.send("First turn");
    await flushPromises();

    ctrl.optimistic("Second turn").send();
    await flushPromises();

    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    // [user1, assistant1, user2] — assistant placeholder excluded
    expect(body.messages).toHaveLength(3);
    expect(body.messages[0].content).toBe("First turn");
    expect(body.messages[2].content).toBe("Second turn");
  });

  it("optimistic flag is false on both messages after stream completes with no chunks", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse([]));
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.optimistic("Hello").send();
    await flushPromises();

    const lastMsgs = onMessages.mock.calls.at(-1)![0];
    expect(lastMsgs[0].optimistic).toBeFalsy();
    expect(lastMsgs[1].optimistic).toBeFalsy();
  });
});

// --- revert() ---

describe("ChatController.revert()", () => {
  it("removes the last user+assistant pair and returns the user text", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["reply"]));
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.send("Hello");
    await flushPromises();

    const text = ctrl.revert();

    expect(text).toBe("Hello");
    expect(onMessages.mock.calls.at(-1)![0]).toHaveLength(0);
  });

  it("returns null when there are no messages", () => {
    const mockFetch = vi.fn();
    const { callbacks } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    expect(ctrl.revert()).toBeNull();
  });

  it("resets status to idle and loading to false", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["reply"]));
    const { callbacks, onLoading, onStatus } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.send("Hello");
    await flushPromises();

    ctrl.revert();

    expect(onStatus).toHaveBeenLastCalledWith("idle");
    expect(onLoading).toHaveBeenLastCalledWith(false);
  });

  it("revert() on an un-sent staged message removes it and returns the text", () => {
    const mockFetch = vi.fn();
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.optimistic("Staged");
    const text = ctrl.revert();

    expect(text).toBe("Staged");
    expect(onMessages.mock.calls.at(-1)![0]).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("preserves earlier turns when reverting the last one", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(createMockResponse(["A"]))
      .mockResolvedValueOnce(createMockResponse(["B"]));
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.send("Turn 1");
    await flushPromises();
    ctrl.send("Turn 2");
    await flushPromises();

    ctrl.revert();

    const msgs = onMessages.mock.calls.at(-1)![0];
    expect(msgs).toHaveLength(2); // Turn 1 pair still there
    expect(msgs[0].content).toBe("Turn 1");
    expect(msgs[1].content).toBe("A");
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
