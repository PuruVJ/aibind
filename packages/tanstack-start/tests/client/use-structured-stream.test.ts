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

import { useStructuredStream } from "../../src/index.js";
import { createMockResponse, flushPromises } from "../helpers.js";

function createFakeSchema(
  jsonSchema: Record<string, unknown> | null,
  vendor?: string,
) {
  return {
    "~standard": {
      version: 1,
      vendor: vendor ?? "test",
      jsonSchema: jsonSchema ?? {},
      validate: vi.fn((value: unknown) => ({ value, issues: undefined })),
    },
  };
}

describe("useStructuredStream (TanStack Start wrapper)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses default endpoint /__aibind__/structured", async () => {
    const schema = createFakeSchema({ type: "object" });
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(['{"ok":true}']));

    const { send } = useStructuredStream({
      schema: schema as never,
      fetch: mockFetch,
    });
    send("prompt");
    await flushPromises();

    expect(mockFetch).toHaveBeenCalledWith(
      "/__aibind__/structured",
      expect.anything(),
    );
  });

  it("allows overriding endpoint", async () => {
    const schema = createFakeSchema({ type: "object" });
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(['{"ok":true}']));

    const { send } = useStructuredStream({
      schema: schema as never,
      fetch: mockFetch,
      endpoint: "/custom/structured",
    });
    send("prompt");
    await flushPromises();

    expect(mockFetch).toHaveBeenCalledWith(
      "/custom/structured",
      expect.anything(),
    );
  });

  it("validates and sets data", async () => {
    const schema = createFakeSchema({ type: "object" });
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(['{"score":0.9}']));

    const { data, send } = useStructuredStream({
      schema: schema as never,
      fetch: mockFetch,
    });
    send("prompt");
    await flushPromises();

    expect((data as unknown as () => unknown)()).toEqual({ score: 0.9 });
  });
});
