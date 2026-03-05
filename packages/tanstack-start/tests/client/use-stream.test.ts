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

import { useStream } from "../../src/index.js";
import { createMockResponse, flushPromises } from "../helpers.js";

describe("useStream (TanStack Start wrapper)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses default endpoint /__aibind__/stream", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["hello"]));

    const { send } = useStream({ fetch: mockFetch });
    send("test");
    await flushPromises();

    expect(mockFetch).toHaveBeenCalledWith(
      "/__aibind__/stream",
      expect.anything(),
    );
  });

  it("allows overriding endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["hello"]));

    const { send } = useStream({
      endpoint: "/custom/stream",
      fetch: mockFetch,
    });
    send("test");
    await flushPromises();

    expect(mockFetch).toHaveBeenCalledWith("/custom/stream", expect.anything());
  });

  it("streams text chunks", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(["Hello", " World"]));

    const { send, text } = useStream({ fetch: mockFetch });
    send("prompt");
    await flushPromises();

    expect((text as unknown as () => string)()).toBe("Hello World");
  });
});
