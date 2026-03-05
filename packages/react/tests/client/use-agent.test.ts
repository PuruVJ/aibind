import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("react", () => {
  return {
    useState: <T>(init: T) => {
      let current = init;
      const get = () => current;
      const set = (v: T | ((prev: T) => T)) => {
        current = typeof v === "function" ? (v as (prev: T) => T)(current) : v;
      };
      return [get, set];
    },
    useRef: <T>(init: T) => ({ current: init }),
    useEffect: vi.fn(),
    useMemo: <T>(fn: () => T) => fn(),
  };
});

import { useAgent } from "../../src/agent/use-agent.js";
import { createMockResponse, flushPromises } from "../helpers.js";

const ENDPOINT = "/api/agent";

describe("useAgent", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("send() adds user message and POSTs", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["hi"]));

    const { send, messages } = useAgent({
      endpoint: ENDPOINT,
      fetch: mockFetch,
    });
    send("hello");
    await flushPromises();

    const msgs = (messages as unknown as () => unknown[])();
    expect(msgs[0]).toEqual(
      expect.objectContaining({ role: "user", content: "hello" }),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("hello"),
      }),
    );
  });

  it("send() streams response into assistant message", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(["Hello", " World"]));

    const { send, messages, status } = useAgent({
      endpoint: ENDPOINT,
      fetch: mockFetch,
    });
    send("greet me");
    await flushPromises();

    const msgs = (messages as unknown as () => unknown[])();
    expect(msgs).toHaveLength(2);
    expect(msgs[1]).toEqual(
      expect.objectContaining({ role: "assistant", content: "Hello World" }),
    );
    expect((status as unknown as () => string)()).toBe("idle");
  });

  it("stop() aborts request and sets status idle", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["hello"]));

    const { send, stop, status } = useAgent({
      endpoint: ENDPOINT,
      fetch: mockFetch,
    });
    send("prompt");
    stop();
    await flushPromises();

    expect((status as unknown as () => string)()).toBe("idle");
  });

  it("approve() initial state is null", () => {
    const { pendingApproval, status } = useAgent({
      endpoint: ENDPOINT,
    });
    expect((pendingApproval as unknown as () => unknown)()).toBeNull();
    expect((status as unknown as () => string)()).toBe("idle");
  });

  it("network error sets error state and calls onError", async () => {
    const onError = vi.fn();
    const mockFetch = vi
      .fn()
      .mockRejectedValue(new Error("Connection refused"));

    const { send, status, error } = useAgent({
      endpoint: ENDPOINT,
      fetch: mockFetch,
      onError,
    });
    send("prompt");
    await flushPromises();

    expect((status as unknown as () => string)()).toBe("error");
    const err = (error as unknown as () => Error | null)();
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toBe("Connection refused");
    expect(onError).toHaveBeenCalledWith(err);
  });

  it("calls onMessage when assistant responds", async () => {
    const onMessage = vi.fn();
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(["response"]));

    const { send } = useAgent({
      endpoint: ENDPOINT,
      fetch: mockFetch,
      onMessage,
    });
    send("hello");
    await flushPromises();

    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: "assistant", content: "response" }),
    );
  });
});
