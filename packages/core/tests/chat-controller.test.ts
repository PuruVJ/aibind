import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatController } from "../src/chat-controller";
import type { ChatCallbacks, BaseChatOptions } from "../src/types";

// --- Helpers ---

function createMockResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let seq = 0;
  let sse = "";
  for (const chunk of chunks) {
    sse += `id: ${seq++}\ndata: ${chunk}\n\n`;
  }
  sse += "event: done\ndata: \n\n";
  const stream = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(encoder.encode(sse));
      ctrl.close();
    },
  });
  return new Response(stream, { status: 200 });
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeCallbacks(): {
  callbacks: ChatCallbacks;
  onMessages: ReturnType<typeof vi.fn>;
  onLoading: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
  onStatus: ReturnType<typeof vi.fn>;
  onTitle: ReturnType<typeof vi.fn>;
  onTitleLoading: ReturnType<typeof vi.fn>;
} {
  const onMessages = vi.fn();
  const onLoading = vi.fn();
  const onError = vi.fn();
  const onStatus = vi.fn();
  const onTitle = vi.fn();
  const onTitleLoading = vi.fn();
  return {
    callbacks: { onMessages, onLoading, onError, onStatus, onTitle, onTitleLoading },
    onMessages,
    onLoading,
    onError,
    onStatus,
    onTitle,
    onTitleLoading,
  };
}

function makeOpts(
  fetch: typeof globalThis.fetch,
  extra?: Partial<BaseChatOptions>,
): BaseChatOptions {
  return { endpoint: "/api/chat", fetch, ...extra };
}

// --- Tests ---

describe("ChatController", () => {
  it("throws when endpoint is missing", () => {
    expect(
      () => new ChatController({ endpoint: "" }, makeCallbacks().callbacks),
    ).toThrow("@aibind: `endpoint` is required.");
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
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(["Hello", " World"]));
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.send("Hi");
    await flushPromises();

    const lastCall = onMessages.mock.calls.at(-1)![0];
    const assistant = lastCall.find(
      (m: { role: string }) => m.role === "assistant",
    );
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
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response("Err", { status: 500 }));
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
    const ctrl = new ChatController(
      makeOpts(mockFetch, { onFinish }),
      callbacks,
    );

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
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(["Hi there"]));
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

// --- Attachment support ---

describe("ChatController attachment support", () => {
  it("send() stores attachments on the user message", () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse([]));
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    const att = { mimeType: "image/png", data: "abc123" };
    ctrl.send("Look at this", { attachments: [att] });

    const msgs = onMessages.mock.calls[0][0];
    expect(msgs[0].attachments).toEqual([att]);
    expect(msgs[1].attachments).toBeUndefined();
  });

  it("send() includes attachments in the fetch payload", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["ok"]));
    const { callbacks } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    const att = { mimeType: "image/jpeg", data: "base64data" };
    ctrl.send("Describe this", { attachments: [att] });
    await flushPromises();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].attachments).toEqual([att]);
  });

  it("send() without attachments omits the field from payload", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["ok"]));
    const { callbacks } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.send("Plain text");
    await flushPromises();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].attachments).toBeUndefined();
  });

  it("optimistic() stores attachments on the staged user message", () => {
    const mockFetch = vi.fn();
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    const att = { mimeType: "image/png", url: "https://example.com/img.png" };
    ctrl.optimistic("Check this out", { attachments: [att] });

    const msgs = onMessages.mock.calls.at(-1)![0];
    expect(msgs[0].attachments).toEqual([att]);
  });

  it("optimistic().send() includes attachments in fetch payload", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["ok"]));
    const { callbacks } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    const att = { mimeType: "application/pdf", data: "pdfdata" };
    ctrl.optimistic("Analyse this", { attachments: [att] }).send();
    await flushPromises();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].attachments).toEqual([att]);
  });

  it("regenerate() replays attachments from the last user message", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(createMockResponse(["first reply"]))
      .mockResolvedValueOnce(createMockResponse(["second reply"]));
    const { callbacks } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    const att = { mimeType: "image/png", data: "img" };
    ctrl.send("Describe", { attachments: [att] });
    await flushPromises();

    ctrl.regenerate();
    await flushPromises();

    const body2 = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body2.messages[0].attachments).toEqual([att]);
  });

  it("edit() passes new attachments through to the re-sent message", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(createMockResponse(["r1"]))
      .mockResolvedValueOnce(createMockResponse(["r2"]));
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.send("Original");
    await flushPromises();

    const userId = onMessages.mock.calls[0][0][0].id;
    const att = { mimeType: "image/gif", data: "gifdata" };
    ctrl.edit(userId, "Edited", { attachments: [att] });
    await flushPromises();

    const body2 = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body2.messages[0].content).toBe("Edited");
    expect(body2.messages[0].attachments).toEqual([att]);
  });
});

// --- SSE Named Events ---

describe("ChatController SSE named events", () => {
  // Helper: build raw SSE response
  function sseOf(...lines: string[]): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(encoder.encode(lines.join("")));
        ctrl.close();
      },
    });
    return new Response(stream, { status: 200 });
  }

  it("usage event is not appended to assistant message content", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        sseOf(
          "id: 0\ndata: Hello\n\n",
          'event: usage\ndata: {"inputTokens":10,"outputTokens":5}\n\n',
          "event: done\ndata: \n\n",
        ),
      );
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);
    ctrl.send("hi");
    await flushPromises();
    const last = onMessages.mock.calls.at(-1)![0];
    const assistant = last.find(
      (m: { role: string }) => m.role === "assistant",
    );
    expect(assistant.content).toBe("Hello");
    expect(assistant.content).not.toContain("inputTokens");
  });

  it("stream-id event is not appended to assistant message content", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        sseOf(
          "event: stream-id\ndata: abc-123\n\n",
          "id: 0\ndata: World\n\n",
          "event: done\ndata: \n\n",
        ),
      );
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);
    ctrl.send("hi");
    await flushPromises();
    const last = onMessages.mock.calls.at(-1)![0];
    const assistant = last.find(
      (m: { role: string }) => m.role === "assistant",
    );
    expect(assistant.content).toBe("World");
    expect(assistant.content).not.toContain("abc-123");
  });

  it("stopped event is not appended to assistant message content", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        sseOf(
          "id: 0\ndata: Partial\n\n",
          "event: stopped\ndata: \n\n",
          "event: done\ndata: \n\n",
        ),
      );
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);
    ctrl.send("hi");
    await flushPromises();
    const last = onMessages.mock.calls.at(-1)![0];
    const assistant = last.find(
      (m: { role: string }) => m.role === "assistant",
    );
    expect(assistant.content).toBe("Partial");
  });

  it("tool_call event fires onToolCall with name and args, not appended to content", async () => {
    const onToolCall = vi.fn();
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        sseOf(
          "id: 0\ndata: Searching\n\n",
          'event: tool_call\ndata: {"name":"search","args":{"q":"cats"}}\n\n',
          "id: 1\ndata: ...\n\n",
          "event: done\ndata: \n\n",
        ),
      );
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(
      makeOpts(mockFetch, { onToolCall }),
      callbacks,
    );
    ctrl.send("hi");
    await flushPromises();
    expect(onToolCall).toHaveBeenCalledOnce();
    expect(onToolCall).toHaveBeenCalledWith("search", { q: "cats" });
    const last = onMessages.mock.calls.at(-1)![0];
    const assistant = last.find(
      (m: { role: string }) => m.role === "assistant",
    );
    expect(assistant.content).toBe("Searching...");
    expect(assistant.content).not.toContain("tool_call");
    expect(assistant.content).not.toContain("search");
  });

  it("multiple sequential tool_call events all fire onToolCall", async () => {
    const onToolCall = vi.fn();
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        sseOf(
          'event: tool_call\ndata: {"name":"a","args":{}}\n\n',
          'event: tool_call\ndata: {"name":"b","args":{"x":1}}\n\n',
          'event: tool_call\ndata: {"name":"c","args":{}}\n\n',
          "id: 0\ndata: Done\n\n",
          "event: done\ndata: \n\n",
        ),
      );
    const { callbacks } = makeCallbacks();
    const ctrl = new ChatController(
      makeOpts(mockFetch, { onToolCall }),
      callbacks,
    );
    ctrl.send("hi");
    await flushPromises();
    expect(onToolCall).toHaveBeenCalledTimes(3);
    expect(onToolCall).toHaveBeenNthCalledWith(1, "a", {});
    expect(onToolCall).toHaveBeenNthCalledWith(2, "b", { x: 1 });
    expect(onToolCall).toHaveBeenNthCalledWith(3, "c", {});
  });

  it("tool_call with no onToolCall option is silently ignored", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        sseOf(
          'event: tool_call\ndata: {"name":"search","args":{}}\n\n',
          "id: 0\ndata: ok\n\n",
          "event: done\ndata: \n\n",
        ),
      );
    const { callbacks } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks); // no onToolCall
    expect(() => {
      ctrl.send("hi");
    }).not.toThrow();
    await flushPromises();
  });

  it("malformed tool_call JSON does not throw and does not append to content", async () => {
    const onToolCall = vi.fn();
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        sseOf(
          "event: tool_call\ndata: NOT_VALID_JSON\n\n",
          "id: 0\ndata: hi\n\n",
          "event: done\ndata: \n\n",
        ),
      );
    const { callbacks, onMessages, onError } = makeCallbacks();
    const ctrl = new ChatController(
      makeOpts(mockFetch, { onToolCall }),
      callbacks,
    );
    ctrl.send("hi");
    await flushPromises();
    expect(onToolCall).not.toHaveBeenCalled();
    const last = onMessages.mock.calls.at(-1)![0];
    const assistant = last.find(
      (m: { role: string }) => m.role === "assistant",
    );
    expect(assistant.content).toBe("hi");
    // No error thrown
    expect(onError.mock.calls.find((c) => c[0] !== null)).toBeUndefined();
  });

  it("error event in SSE stream fires onError", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        sseOf(
          "id: 0\ndata: partial\n\n",
          "event: error\ndata: Model overloaded\n\n",
        ),
      );
    const { callbacks, onError, onStatus } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);
    ctrl.send("hi");
    await flushPromises();
    const errorCall = onError.mock.calls.find((c) => c[0] !== null);
    expect(errorCall).toBeDefined();
    expect(errorCall![0]).toBeInstanceOf(Error);
    expect(errorCall![0].message).toBe("Model overloaded");
    expect(onStatus).toHaveBeenCalledWith("error");
  });

  it("done event stops processing — subsequent chunks are ignored", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        sseOf(
          "id: 0\ndata: first\n\n",
          "event: done\ndata: \n\n",
          "id: 1\ndata: after-done\n\n",
        ),
      );
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);
    ctrl.send("hi");
    await flushPromises();
    const last = onMessages.mock.calls.at(-1)![0];
    const assistant = last.find(
      (m: { role: string }) => m.role === "assistant",
    );
    expect(assistant.content).toBe("first");
    expect(assistant.content).not.toContain("after-done");
  });

  it("all named events before any text chunk do not corrupt the first-chunk confirmation", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        sseOf(
          "event: stream-id\ndata: xyz\n\n",
          'event: tool_call\ndata: {"name":"t","args":{}}\n\n',
          "event: usage\ndata: {}\n\n",
          "id: 0\ndata: real text\n\n",
          "event: done\ndata: \n\n",
        ),
      );
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);
    ctrl.send("hi");
    await flushPromises();
    const last = onMessages.mock.calls.at(-1)![0];
    const assistant = last.find(
      (m: { role: string }) => m.role === "assistant",
    );
    expect(assistant.content).toBe("real text");
    expect(assistant.optimistic).toBeFalsy();
  });

  it("stream with only named events and no text chunks confirms optimistic messages", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        sseOf("event: usage\ndata: {}\n\n", "event: done\ndata: \n\n"),
      );
    const { callbacks, onMessages } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);
    ctrl.send("hi");
    await flushPromises();
    const last = onMessages.mock.calls.at(-1)![0];
    expect(last[0].optimistic).toBeFalsy();
    expect(last[1].optimistic).toBeFalsy();
    expect(last[1].content).toBe("");
  });
});

// --- Toolset / maxSteps request body ---

describe("ChatController toolset and maxSteps", () => {
  it("sends toolset in request body when configured", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["ok"]));
    const { callbacks } = makeCallbacks();
    const ctrl = new ChatController(
      makeOpts(mockFetch, { toolset: "search" }),
      callbacks,
    );
    ctrl.send("hi");
    await flushPromises();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.toolset).toBe("search");
  });

  it("sends maxSteps in request body when configured", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["ok"]));
    const { callbacks } = makeCallbacks();
    const ctrl = new ChatController(
      makeOpts(mockFetch, { maxSteps: 5 }),
      callbacks,
    );
    ctrl.send("hi");
    await flushPromises();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.maxSteps).toBe(5);
  });

  it("toolset and maxSteps are both undefined when not configured", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["ok"]));
    const { callbacks } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);
    ctrl.send("hi");
    await flushPromises();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.toolset).toBeUndefined();
    expect(body.maxSteps).toBeUndefined();
  });
});

// --- generateTitle() ---

function makeTitleResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(ctrl) {
      for (const chunk of chunks) ctrl.enqueue(encoder.encode(chunk));
      ctrl.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

describe("ChatController.generateTitle()", () => {
  it("does nothing when there are no messages", async () => {
    const mockFetch = vi.fn();
    const { callbacks, onTitle, onTitleLoading } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    await ctrl.generateTitle();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(onTitle).not.toHaveBeenCalled();
    expect(onTitleLoading).not.toHaveBeenCalled();
  });

  it("does nothing when all messages are optimistic", async () => {
    const mockFetch = vi.fn();
    // First fetch for send(), second would be title — never called
    mockFetch.mockResolvedValueOnce(createMockResponse([]));
    const { callbacks, onTitle } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(mockFetch), callbacks);

    ctrl.send("hi"); // still optimistic before flushPromises
    await ctrl.generateTitle(); // messages are still optimistic at this point

    expect(onTitle).not.toHaveBeenCalled();
  });

  it("streams title chunks into onTitle", async () => {
    const chatFetch = vi.fn().mockResolvedValue(createMockResponse(["ok"]));
    const { callbacks, onTitle } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(chatFetch), callbacks);

    ctrl.send("Tell me about space");
    await flushPromises(); // chat completes, messages confirmed

    const titleFetch = vi
      .fn()
      .mockResolvedValue(makeTitleResponse(["Space", " Expl", "oration"]));
    // Swap fetch for the title call
    (ctrl as any)._opts.fetch = titleFetch;

    await ctrl.generateTitle();

    // onTitle called for each chunk accumulation: "", "Space", "Space Expl", "Space Exploration"
    const titleCalls = onTitle.mock.calls.map((c) => c[0]);
    expect(titleCalls).toContain("Space");
    expect(titleCalls.at(-1)).toBe("Space Exploration");
  });

  it("fires onTitleLoading(true) then onTitleLoading(false)", async () => {
    const chatFetch = vi.fn().mockResolvedValue(createMockResponse(["ok"]));
    const { callbacks, onTitleLoading } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(chatFetch), callbacks);

    ctrl.send("hi");
    await flushPromises();

    const titleFetch = vi
      .fn()
      .mockResolvedValue(makeTitleResponse(["My Title"]));
    (ctrl as any)._opts.fetch = titleFetch;

    await ctrl.generateTitle();

    expect(onTitleLoading).toHaveBeenCalledWith(true);
    expect(onTitleLoading).toHaveBeenLastCalledWith(false);
  });

  it("calls onTitle('') at the start to reset the title", async () => {
    const chatFetch = vi.fn().mockResolvedValue(createMockResponse(["ok"]));
    const { callbacks, onTitle } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(chatFetch), callbacks);

    ctrl.send("hi");
    await flushPromises();

    const titleFetch = vi.fn().mockResolvedValue(makeTitleResponse(["New"]));
    (ctrl as any)._opts.fetch = titleFetch;

    await ctrl.generateTitle();

    expect(onTitle.mock.calls[0][0]).toBe("");
  });

  it("posts to /__aibind__/title by default", async () => {
    const chatFetch = vi.fn().mockResolvedValue(createMockResponse(["ok"]));
    const { callbacks } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(chatFetch), callbacks);

    ctrl.send("hi");
    await flushPromises();

    const titleFetch = vi.fn().mockResolvedValue(makeTitleResponse(["T"]));
    (ctrl as any)._opts.fetch = titleFetch;

    await ctrl.generateTitle();

    expect(titleFetch.mock.calls[0][0]).toBe("/__aibind__/title");
  });

  it("uses titleEndpoint option when set", async () => {
    const chatFetch = vi.fn().mockResolvedValue(createMockResponse(["ok"]));
    const { callbacks } = makeCallbacks();
    const ctrl = new ChatController(
      makeOpts(chatFetch, { titleEndpoint: "/api/my-title" }),
      callbacks,
    );

    ctrl.send("hi");
    await flushPromises();

    const titleFetch = vi.fn().mockResolvedValue(makeTitleResponse(["T"]));
    (ctrl as any)._opts.fetch = titleFetch;

    await ctrl.generateTitle();

    expect(titleFetch.mock.calls[0][0]).toBe("/api/my-title");
  });

  it("sends up to 6 messages in the title request body", async () => {
    const chatFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(["reply"]));
    const { callbacks } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(chatFetch), callbacks);

    // Build up 4 turns (8 messages) by calling send + flushPromises repeatedly
    for (let i = 0; i < 4; i++) {
      chatFetch.mockResolvedValueOnce(createMockResponse([`r${i}`]));
      ctrl.send(`Turn ${i}`);
      await flushPromises();
    }

    const titleFetch = vi.fn().mockResolvedValue(makeTitleResponse(["T"]));
    (ctrl as any)._opts.fetch = titleFetch;

    await ctrl.generateTitle();

    const body = JSON.parse(titleFetch.mock.calls[0][1].body);
    expect(body.messages.length).toBeLessThanOrEqual(6);
  });

  it("silently swallows title fetch errors", async () => {
    const chatFetch = vi.fn().mockResolvedValue(createMockResponse(["ok"]));
    const { callbacks, onError, onTitleLoading } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(chatFetch), callbacks);

    ctrl.send("hi");
    await flushPromises();

    const titleFetch = vi
      .fn()
      .mockRejectedValue(new Error("network failure"));
    (ctrl as any)._opts.fetch = titleFetch;

    await expect(ctrl.generateTitle()).resolves.toBeUndefined();
    // Chat error state untouched, loading cleaned up
    expect(onError.mock.calls.find((c) => c[0] !== null)).toBeUndefined();
    expect(onTitleLoading).toHaveBeenLastCalledWith(false);
  });

  it("silently swallows non-ok title response", async () => {
    const chatFetch = vi.fn().mockResolvedValue(createMockResponse(["ok"]));
    const { callbacks, onTitleLoading } = makeCallbacks();
    const ctrl = new ChatController(makeOpts(chatFetch), callbacks);

    ctrl.send("hi");
    await flushPromises();

    const titleFetch = vi
      .fn()
      .mockResolvedValue(new Response("Error", { status: 500 }));
    (ctrl as any)._opts.fetch = titleFetch;

    await expect(ctrl.generateTitle()).resolves.toBeUndefined();
    expect(onTitleLoading).toHaveBeenLastCalledWith(false);
  });

  it("autoTitle: true fires generateTitle after the first turn (once)", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/__aibind__/title") {
        callCount++;
        return Promise.resolve(makeTitleResponse(["Auto Title"]));
      }
      return Promise.resolve(createMockResponse(["reply"]));
    });
    const { callbacks, onTitle } = makeCallbacks();
    const ctrl = new ChatController(
      makeOpts(mockFetch, { autoTitle: true }),
      callbacks,
    );

    ctrl.send("First message");
    await flushPromises();

    expect(callCount).toBe(1);
    const titleCalls = onTitle.mock.calls.map((c) => c[0]).filter(Boolean);
    expect(titleCalls.at(-1)).toBe("Auto Title");
  });

  it("autoTitle: true does NOT fire again on subsequent turns", async () => {
    let titleCallCount = 0;
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/__aibind__/title") {
        titleCallCount++;
        return Promise.resolve(makeTitleResponse(["Title"]));
      }
      return Promise.resolve(createMockResponse(["reply"]));
    });
    const { callbacks } = makeCallbacks();
    const ctrl = new ChatController(
      makeOpts(mockFetch, { autoTitle: true }),
      callbacks,
    );

    ctrl.send("First");
    await flushPromises();
    ctrl.send("Second");
    await flushPromises();
    ctrl.send("Third");
    await flushPromises();

    expect(titleCallCount).toBe(1);
  });

  it("autoTitle: false never fires generateTitle automatically", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["ok"]));
    const { callbacks, onTitle } = makeCallbacks();
    const ctrl = new ChatController(
      makeOpts(mockFetch, { autoTitle: false }),
      callbacks,
    );

    ctrl.send("hi");
    await flushPromises();

    // Only one fetch call — the chat one
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(onTitle).not.toHaveBeenCalled();
  });
});

// --- StreamHandler.chat ---

describe("StreamHandler.chat", () => {
  beforeEach(() => vi.resetModules());

  it("returns 400 when messages is missing", async () => {
    const { StreamHandler } = await import("../src/stream-handler");
    const handler = new StreamHandler({ model: "mock" as any });
    const res = await handler.chat({
      messages: [],
      system: undefined,
      model: undefined,
    });
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
