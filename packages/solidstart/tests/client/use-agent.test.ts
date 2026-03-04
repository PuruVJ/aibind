import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("solid-js", async () => {
  const actual = await vi.importActual<typeof import("solid-js")>("solid-js");
  return {
    ...actual,
    onCleanup: vi.fn(),
  };
});

import { useAgent } from "../../src/agent.js";
import { createMockResponse, flushPromises } from "../helpers.js";

describe("useAgent (SolidStart wrapper)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses default endpoint /api/__aibind__/agent", async () => {
    const mockFetch = vi.fn().mockResolvedValue(createMockResponse(["hi"]));

    const { send } = useAgent({ fetch: mockFetch });
    send("hello");
    await flushPromises();

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/__aibind__/agent",
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

    expect(messages()).toHaveLength(2);
    expect(messages()[1]).toEqual(
      expect.objectContaining({ role: "assistant", content: "Hello World" }),
    );
  });
});
