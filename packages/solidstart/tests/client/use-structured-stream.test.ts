import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("solid-js", async () => {
  const actual = await vi.importActual<typeof import("solid-js")>("solid-js");
  return {
    ...actual,
    onCleanup: vi.fn(),
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

describe("useStructuredStream (SolidStart wrapper)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses default endpoint /__aibind__/structured", async () => {
    const schema = createFakeSchema({ type: "object" });
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(['{\"ok\":true}']));

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
      .mockResolvedValue(createMockResponse(['{\"ok\":true}']));

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
      .mockResolvedValue(createMockResponse(['{\"score\":0.9}']));

    const { data, send } = useStructuredStream({
      schema: schema as never,
      fetch: mockFetch,
    });
    send("prompt");
    await flushPromises();

    expect(data()).toEqual({ score: 0.9 });
  });
});
