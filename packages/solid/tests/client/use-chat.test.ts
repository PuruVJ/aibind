import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("solid-js", async () => {
  const actual = await vi.importActual<typeof import("solid-js")>("solid-js");
  return {
    ...actual,
    onCleanup: vi.fn(),
  };
});

import { useChat } from "../../src/index.js";
import type { ChatMessage } from "../../src/index.js";

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

describe("useChat (Solid)", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue(createMockResponse(["Hello"]));
  });

  it("returns idle initial state", () => {
    const chat = useChat({ endpoint: "/api/chat", fetch: mockFetch });
    expect(chat.messages()).toHaveLength(0);
    expect(chat.loading()).toBe(false);
    expect(chat.error()).toBeNull();
    expect(chat.status()).toBe("idle");
  });

  it("send() adds user and assistant messages", async () => {
    const chat = useChat({ endpoint: "/api/chat", fetch: mockFetch });
    chat.send("Hi");
    await flushPromises();

    const msgs = chat.messages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toBe("Hi");
    expect(msgs[1].role).toBe("assistant");
    expect(msgs[1].content).toBe("Hello");
  });

  it("ignores empty send", () => {
    const chat = useChat({ endpoint: "/api/chat", fetch: mockFetch });
    chat.send("  ");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("clear() resets messages", async () => {
    const chat = useChat({ endpoint: "/api/chat", fetch: mockFetch });
    chat.send("hi");
    await flushPromises();
    chat.clear();
    expect(chat.messages()).toHaveLength(0);
  });

  it("regenerate() re-sends last user message", async () => {
    mockFetch
      .mockResolvedValueOnce(createMockResponse(["first"]))
      .mockResolvedValueOnce(createMockResponse(["second"]));

    const chat = useChat({ endpoint: "/api/chat", fetch: mockFetch });
    chat.send("Prompt");
    await flushPromises();
    chat.regenerate();
    await flushPromises();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(chat.messages()).toHaveLength(2);
    expect(chat.messages()[1].content).toBe("second");
  });

  it("edit() truncates and re-sends", async () => {
    mockFetch
      .mockResolvedValueOnce(createMockResponse(["reply1"]))
      .mockResolvedValueOnce(createMockResponse(["reply2"]));

    const chat = useChat({ endpoint: "/api/chat", fetch: mockFetch });
    chat.send("Original");
    await flushPromises();

    const firstUserId = (chat.messages() as ChatMessage[])[0].id;
    chat.edit(firstUserId, "Edited");
    await flushPromises();

    expect(chat.messages()).toHaveLength(2);
    expect(chat.messages()[0].content).toBe("Edited");
    expect(chat.messages()[1].content).toBe("reply2");
  });

  it("fires error state on non-ok response", async () => {
    mockFetch.mockResolvedValue(new Response("fail", { status: 500 }));
    const chat = useChat({ endpoint: "/api/chat", fetch: mockFetch });
    chat.send("test");
    await flushPromises();
    expect(chat.error()).toBeInstanceOf(Error);
    expect(chat.status()).toBe("error");
  });
});
