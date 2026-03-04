import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("vue", async () => {
  const actual = await vi.importActual<typeof import("vue")>("vue");
  return {
    ...actual,
    onUnmounted: vi.fn(),
  };
});

import { useStructuredStream } from "../../src/index.js";
import { createMockResponse, flushPromises } from "../helpers.js";

// Helper to create a fake Standard Schema
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

describe("useStructuredStream", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves schema from ~standard.jsonSchema", async () => {
    const schema = createFakeSchema({
      type: "object",
      properties: { name: { type: "string" } },
    });
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(['{"name":"Alice"}']));

    const { send } = useStructuredStream({
      schema: schema as never,
      fetch: mockFetch,
      endpoint: "/api/structured",
    });
    send("prompt");
    await flushPromises();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.schema).toEqual({
      type: "object",
      properties: { name: { type: "string" } },
    });
  });

  it("resolves schema from toJsonSchema() method", async () => {
    const schema = {
      "~standard": {
        version: 1,
        vendor: "test",
        jsonSchema: {},
        validate: vi.fn((value: unknown) => ({ value, issues: undefined })),
      },
      toJsonSchema: () => ({
        type: "object",
        properties: { id: { type: "number" } },
      }),
    };
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(['{"id":1}']));

    const { send } = useStructuredStream({
      schema: schema as never,
      fetch: mockFetch,
      endpoint: "/api/structured",
    });
    send("prompt");
    await flushPromises();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.schema).toEqual({
      type: "object",
      properties: { id: { type: "number" } },
    });
  });

  it("streams raw JSON and populates .partial", async () => {
    const schema = createFakeSchema({ type: "object" });
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(['{"name":', '"Bob"}']));

    const { partial, send } = useStructuredStream({
      schema: schema as never,
      fetch: mockFetch,
      endpoint: "/api/structured",
    });
    send("prompt");
    await flushPromises();

    expect(partial.value).toEqual({ name: "Bob" });
  });

  it("final JSON validates and sets .data", async () => {
    const schema = createFakeSchema({ type: "object" });
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(['{"score":0.9}']));

    const { data, send } = useStructuredStream({
      schema: schema as never,
      fetch: mockFetch,
      endpoint: "/api/structured",
    });
    send("prompt");
    await flushPromises();

    expect(data.value).toEqual({ score: 0.9 });
  });

  it("validation failure sets .error", async () => {
    const schema = {
      "~standard": {
        version: 1,
        vendor: "test",
        jsonSchema: { type: "object" },
        validate: vi.fn(() => ({
          value: undefined,
          issues: [{ message: "invalid type" }],
        })),
      },
    };
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(['{"bad":true}']));

    const { error, send } = useStructuredStream({
      schema: schema as never,
      fetch: mockFetch,
      endpoint: "/api/structured",
    });
    send("prompt");
    await flushPromises();

    expect(error.value).toBeInstanceOf(Error);
    expect(error.value!.message).toContain("invalid type");
  });

  it("calls onFinish with validated data", async () => {
    const onFinish = vi.fn();
    const schema = createFakeSchema({ type: "object" });
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(['{"ok":true}']));

    const { send } = useStructuredStream({
      schema: schema as never,
      fetch: mockFetch,
      endpoint: "/api/structured",
      onFinish,
    });
    send("prompt");
    await flushPromises();

    expect(onFinish).toHaveBeenCalledWith({ ok: true });
  });

  it("schema resolution is cached (resolved once)", async () => {
    const toJsonSchema = vi.fn(() => ({ type: "object" }));
    const schema = {
      "~standard": {
        version: 1,
        vendor: "test",
        jsonSchema: {},
        validate: vi.fn((value: unknown) => ({ value, issues: undefined })),
      },
      toJsonSchema,
    };
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createMockResponse(['{"a":1}']));

    const { send } = useStructuredStream({
      schema: schema as never,
      fetch: mockFetch,
      endpoint: "/api/structured",
    });
    send("first");
    await flushPromises();

    mockFetch.mockResolvedValue(createMockResponse(['{"a":2}']));
    send("second");
    await flushPromises();

    expect(toJsonSchema).toHaveBeenCalledTimes(1);
  });
});
