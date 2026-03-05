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

import { useAgent } from "../../src/agent.js";
import { createMockResponse, flushPromises } from "../helpers.js";

describe("useAgent (Next.js wrapper)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses default endpoint /__aibind__/agent", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["hi"]));

    const { send } = useAgent({ fetch: mockFetch });
    send("hello");
    await flushPromises();

    expect(mockFetch).toHaveBeenCalledWith(
      "/__aibind__/agent",
      expect.anything(),
    );
  });

  it("allows overriding endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["hi"]));

    const { send } = useAgent({ endpoint: "/custom/agent", fetch: mockFetch });
    send("hello");
    await flushPromises();

    expect(mockFetch).toHaveBeenCalledWith("/custom/agent", expect.anything());
  });

  it("streams agent response", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(["Hello", " World"]));

    const { send, messages } = useAgent({ fetch: mockFetch });
    send("greet me");
    await flushPromises();

    const msgs = (messages as unknown as () => unknown[])();
    expect(msgs).toHaveLength(2);
    expect(msgs[1]).toEqual(
      expect.objectContaining({ role: "assistant", content: "Hello World" }),
    );
  });
});
